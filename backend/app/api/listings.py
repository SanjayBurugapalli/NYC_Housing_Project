"""Resolve a pasted StreetEasy / Zillow listing link to a building."""

import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import BuildingSummaryResponse, ResolveListingRequest, ResolveListingResponse
from app.api.search import _sanitize_row, search_by_address, search_by_bbl
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.services.building_service import BUILDING_SUMMARY_SELECT, score_to_grade
from app.services.geosearch import GeoMatch, geosearch, normalize_house_number
from app.services.listing_parser import ParsedListing, parse_listing_url

router = APIRouter(tags=["listings"])

logger = logging.getLogger(__name__)

MESSAGES = {
    "no_address": "This link doesn't include the building's address. Type the address instead.",
    "not_found": "We couldn't match that address to a building. Try typing it instead.",
    "invalid": "That doesn't look like a StreetEasy or Zillow listing link.",
}

# How far a GeoSearch point may sit from a building's lot centroid and still
# count as that building, when PAD's BBL/BIN don't match a row directly.
_NEAREST_MATCH_METERS = 30


def _matches_parsed(parsed: ParsedListing, match: GeoMatch) -> bool:
    """Reject GeoSearch's fuzzy fallbacks that landed on a different address."""
    if parsed.house_number and match.housenumber:
        if normalize_house_number(parsed.house_number) != normalize_house_number(match.housenumber):
            return False
    if parsed.borough and match.borough and parsed.borough != match.borough:
        return False
    return True


async def _by_bin(db: AsyncSession, bin_: str) -> list[dict]:
    result = await db.execute(
        text(f"{BUILDING_SUMMARY_SELECT} WHERE b.bin = :bin LIMIT 1"),
        {"bin": bin_},
    )
    return [_sanitize_row(dict(row._mapping)) for row in result]


async def _nearest(db: AsyncSession, lat: float, lng: float) -> list[dict]:
    result = await db.execute(
        text(f"""
            {BUILDING_SUMMARY_SELECT}
            WHERE ST_DWithin(
                b.geom::geography,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                :radius
            )
            ORDER BY b.geom <-> ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)
            LIMIT 1
        """),
        {"lat": lat, "lng": lng, "radius": _NEAREST_MATCH_METERS},
    )
    return [_sanitize_row(dict(row._mapping)) for row in result]


async def match_building(db: AsyncSession, parsed: ParsedListing) -> dict | None:
    """GeoSearch → BBL → BIN → nearest lot, then a DB address search as a last resort."""
    query = parsed.geocode_text
    if not query:
        return None

    match = await geosearch(query)
    if match and _matches_parsed(parsed, match):
        if match.bbl:
            rows = await search_by_bbl(db, match.bbl)
            if rows:
                return rows[0]
        if match.bin:
            rows = await _by_bin(db, match.bin)
            if rows:
                return rows[0]
        rows = await _nearest(db, match.latitude, match.longitude)
        if rows:
            return rows[0]

    # GeoSearch down or no usable match: fall back to our own trigram address
    # search, keeping only rows with the exact house number (the ILIKE would
    # otherwise let "1 Main St" match "101 Main St").
    street_address = parsed.street_address
    if not street_address:
        return None
    wanted = normalize_house_number(parsed.house_number)
    for row in await search_by_address(db, street_address, include_small_homes=True):
        address = (row.get("address") or "").strip()
        if not address or normalize_house_number(address.split(" ", 1)[0]) != wanted:
            continue
        if parsed.borough and row.get("borough") != parsed.borough:
            continue
        return row
    return None


@router.post("/resolve-listing", response_model=ResolveListingResponse)
@limiter.limit("60/minute")
async def resolve_listing(
    request: Request,
    body: ResolveListingRequest,
    db: AsyncSession = Depends(get_db),
):
    """Find the building behind a StreetEasy or Zillow listing URL (never fetches the URL)."""
    parsed = parse_listing_url(body.url)

    if parsed.status == "invalid":
        return ResolveListingResponse(status="invalid", source=parsed.source, message=MESSAGES["invalid"])
    if parsed.status == "no_address":
        return ResolveListingResponse(status="no_address", source=parsed.source, message=MESSAGES["no_address"])
    if parsed.status == "out_of_area":
        return ResolveListingResponse(status="not_found", source=parsed.source, message=MESSAGES["not_found"])

    row = await match_building(db, parsed)
    if not row:
        logger.info("resolve-listing: no building for %r", parsed.geocode_text)
        return ResolveListingResponse(
            status="not_found",
            source=parsed.source,
            parsed_address=parsed.display_address,
            message=MESSAGES["not_found"],
        )

    building = BuildingSummaryResponse(**row, grade=score_to_grade(row.get("health_score", 0)))
    return ResolveListingResponse(
        status="found",
        source=parsed.source,
        parsed_address=parsed.display_address,
        building=building,
    )
