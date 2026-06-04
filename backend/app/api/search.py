import logging
import math
import re

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import BuildingSummaryResponse, SearchRequest, SearchResponse
from app.core.config import MAX_RESULTS
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.services.building_service import BUILDING_SUMMARY_SELECT, score_to_grade

router = APIRouter(tags=["search"])

logger = logging.getLogger(__name__)


def _sanitize_row(row: dict) -> dict:
    """Replace NaN/Inf float values with sensible defaults."""
    out = {}
    for k, v in row.items():
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            out[k] = 0.0 if k == "health_score" else None
        else:
            out[k] = v
    return out

# BBL pattern: 10 digits (or 1-digit borough + block + lot)
BBL_PATTERN = re.compile(r"^\d{10}$")

# Direction word ↔ abbreviation mappings (applied with \b word boundaries)
_DIR_CONTRACT = [("EAST", "E"), ("WEST", "W"), ("NORTH", "N"), ("SOUTH", "S")]
_DIR_EXPAND   = [("E", "EAST"), ("W", "WEST"), ("N", "NORTH"), ("S", "SOUTH")]

# Street suffix ↔ abbreviation mappings
_SFX_CONTRACT = [
    ("STREET", "ST"), ("AVENUE", "AVE"), ("BOULEVARD", "BLVD"),
    ("DRIVE", "DR"), ("ROAD", "RD"), ("PLACE", "PL"),
    ("COURT", "CT"), ("LANE", "LN"), ("TERRACE", "TER"), ("PARKWAY", "PKWY"),
]
_SFX_EXPAND = [(b, a) for a, b in _SFX_CONTRACT]


def _apply_map(s: str, mapping: list[tuple[str, str]]) -> str:
    for src, dst in mapping:
        s = re.sub(r"\b" + re.escape(src) + r"\b", dst, s)
    return s


def _address_variants(raw: str) -> list[str]:
    """Return up to 5 normalized address variants for LIKE matching.

    Handles:
    - Extra/multiple spaces
    - Ordinal suffixes (42ND → 42, 1ST → 1)
    - Direction words ↔ abbreviations (EAST ↔ E, WEST ↔ W …)
    - Street suffix words ↔ abbreviations (STREET ↔ ST, AVENUE ↔ AVE …)

    The DB is inconsistent (some entries have EAST, some E; some STREET, some ST),
    so we try multiple variants and OR them in the query.
    """
    # Base: collapse whitespace, uppercase
    q = re.sub(r"\s+", " ", raw).strip().upper()
    # Without ordinal suffixes (42ND → 42, but NOT when the number is a standalone "1ST AVE")
    q_no_ord = re.sub(r"\b(\d+)(ST|ND|RD|TH)\b", r"\1", q)

    seen: set[str] = set()
    result: list[str] = []

    def add(v: str) -> None:
        if v not in seen:
            seen.add(v)
            result.append(v)

    for base in [q, q_no_ord]:
        add(base)
        # Contract: EAST→E, STREET→ST
        contracted = _apply_map(_apply_map(base, _DIR_CONTRACT), _SFX_CONTRACT)
        add(contracted)
        # Expand directions only: E→EAST (safe; avoids false suffix expansions)
        expanded_dir = _apply_map(base, _DIR_EXPAND)
        add(expanded_dir)

    return result[:5]  # cap to keep query complexity low


EXCLUDE_SMALL_HOMES = "b.building_class NOT LIKE 'A%' AND b.building_class NOT LIKE 'B%'"

async def search_by_address(db: AsyncSession, query: str, include_small_homes: bool = False) -> list[dict]:
    """Search buildings by address substring match, trying multiple normalized variants."""
    size_clause = "" if include_small_homes else f"AND {EXCLUDE_SMALL_HOMES}"
    variants = _address_variants(query)

    # Build OR'd LIKE conditions for each variant
    like_clauses = " OR ".join(f"UPPER(b.address) LIKE :p{i}" for i in range(len(variants)))
    params: dict = {f"p{i}": f"%{v}%" for i, v in enumerate(variants)}
    params["limit"] = MAX_RESULTS

    result = await db.execute(
        text(f"""
            {BUILDING_SUMMARY_SELECT}
            WHERE ({like_clauses}) {size_clause}
            ORDER BY hs.composite_score DESC NULLS LAST
            LIMIT :limit
        """),
        params,
    )
    return [_sanitize_row(dict(row._mapping)) for row in result]


async def search_by_bbl(db: AsyncSession, bbl: str) -> list[dict]:
    """Search for a specific building by BBL."""
    result = await db.execute(
        text(f"""
            {BUILDING_SUMMARY_SELECT}
            WHERE b.bbl = :bbl
        """),
        {"bbl": bbl},
    )
    return [_sanitize_row(dict(row._mapping)) for row in result]


def looks_like_address(query: str) -> bool:
    """Heuristic: query looks like a specific building address (not a natural-language search)."""
    q = query.strip()
    # Standard: starts with house number — "123 Main St", "45-67 Broadway"
    if re.match(r"^\d+[\-\d]*\s+\w", q):
        return True
    # Directional prefix: "W 42nd St", "E 18 St", "N 8th Street"
    if re.match(r"^[EWNS]\s+\d", q, re.IGNORECASE):
        return True
    return False


async def _search_by_field(db: AsyncSession, field: str, value: str) -> list[dict]:
    """Return buildings matching a specific owner_name or managing_agent (exact, case-insensitive)."""
    result = await db.execute(
        text(f"""
            {BUILDING_SUMMARY_SELECT}
            WHERE LOWER(b.{field}) = LOWER(:value)
              AND b.latitude IS NOT NULL
            ORDER BY hs.composite_score ASC NULLS LAST
            LIMIT :limit
        """),
        {"value": value, "limit": MAX_RESULTS},
    )
    return [_sanitize_row(dict(row._mapping)) for row in result]


@router.get("/search/by-owner", response_model=SearchResponse)
async def buildings_by_owner(name: str, db: AsyncSession = Depends(get_db)):
    rows = await _search_by_field(db, "owner_name", name)
    buildings = [BuildingSummaryResponse(**b, grade=score_to_grade(b.get("health_score", 0))) for b in rows]
    return SearchResponse(
        results=buildings,
        total=len(buildings),
        query=name,
        clarification=f"{len(buildings)} building{'s' if len(buildings) != 1 else ''} owned by {name}",
    )


@router.get("/search/by-manager", response_model=SearchResponse)
async def buildings_by_manager(name: str, db: AsyncSession = Depends(get_db)):
    rows = await _search_by_field(db, "managing_agent", name)
    buildings = [BuildingSummaryResponse(**b, grade=score_to_grade(b.get("health_score", 0))) for b in rows]
    return SearchResponse(
        results=buildings,
        total=len(buildings),
        query=name,
        clarification=f"{len(buildings)} building{'s' if len(buildings) != 1 else ''} managed by {name}",
    )


@router.post("/search", response_model=SearchResponse)
@limiter.limit("60/minute")
async def search_buildings(
    request: Request,
    body: SearchRequest,
    db: AsyncSession = Depends(get_db),
):
    """Search buildings by address, BBL, or natural language (AI)."""
    query = body.query.strip().replace("\x00", "")  # strip null bytes

    # Direct BBL lookup
    if BBL_PATTERN.match(query):
        results = await search_by_bbl(db, query)
        buildings = [
            BuildingSummaryResponse(
                **b,
                grade=score_to_grade(b.get("health_score", 0)),
            )
            for b in results
        ]
        return SearchResponse(
            results=buildings,
            total=len(buildings),
            query=query,
        )

    include_small_homes = body.include_small_homes
    extra_filters: dict = {"include_small_homes": include_small_homes}
    if body.borough:
        # Normalize to uppercase to match DB values (e.g. "BROOKLYN")
        extra_filters["borough"] = body.borough.upper()
    if body.min_units is not None:
        extra_filters["min_units"] = body.min_units

    # Address search (only if the query looks like a specific street address)
    if looks_like_address(query):
        results = await search_by_address(db, query, include_small_homes)
        buildings = [
            BuildingSummaryResponse(
                **b,
                grade=score_to_grade(b.get("health_score", 0)),
            )
            for b in results
        ]
        return SearchResponse(
            results=buildings,
            total=len(buildings),
            query=query,
            clarification=f"Showing address matches for \"{query}\"" if buildings else None,
        )

    # Natural language → AI search
    try:
        from app.services.search_service import search_buildings_ai
        result = await search_buildings_ai(db, query, extra_filters=extra_filters if extra_filters else None)
        buildings = []
        for b in result["results"]:
            row = _sanitize_row(b)  # already coerces NaN/Inf health_score → 0.0
            buildings.append(
                BuildingSummaryResponse(**row, grade=score_to_grade(row.get("health_score", 0)))
            )
        return SearchResponse(
            results=buildings,
            total=result["total"],
            query=result["query"],
            clarification=result.get("clarification"),
            confidence=result.get("confidence"),
            needs_fallback=result.get("needs_fallback", False),
        )
    except Exception:
        logger.exception("AI search failed for query=%r; returning empty results", query)
        return SearchResponse(
            results=[],
            total=0,
            query=query,
            clarification="No results found. Try searching by address or BBL.",
        )
