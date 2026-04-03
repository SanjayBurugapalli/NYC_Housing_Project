import math
import re

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import BuildingSummaryResponse, SearchRequest, SearchResponse
from app.core.database import get_db
from app.services.building_service import score_to_grade

router = APIRouter(tags=["search"])


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

MAX_RESULTS = 100


async def search_by_address(db: AsyncSession, query: str) -> list[dict]:
    """Search buildings by address substring match."""
    result = await db.execute(
        text("""
            SELECT
                b.bbl, b.bin, b.address, b.borough, b.neighborhood,
                COALESCE(hs.composite_score, 0) as health_score,
                b.latitude, b.longitude,
                b.residential_units, b.year_built, b.building_class
            FROM buildings b
            LEFT JOIN health_scores hs ON hs.building_id = b.id
            WHERE UPPER(b.address) LIKE :pattern
            ORDER BY hs.composite_score ASC NULLS LAST
            LIMIT :limit
        """),
        {"pattern": f"%{query.upper()}%", "limit": MAX_RESULTS},
    )
    return [_sanitize_row(dict(row._mapping)) for row in result]


async def search_by_bbl(db: AsyncSession, bbl: str) -> list[dict]:
    """Search for a specific building by BBL."""
    result = await db.execute(
        text("""
            SELECT
                b.bbl, b.bin, b.address, b.borough, b.neighborhood,
                COALESCE(hs.composite_score, 0) as health_score,
                b.latitude, b.longitude,
                b.residential_units, b.year_built, b.building_class
            FROM buildings b
            LEFT JOIN health_scores hs ON hs.building_id = b.id
            WHERE b.bbl = :bbl
        """),
        {"bbl": bbl},
    )
    return [_sanitize_row(dict(row._mapping)) for row in result]


def looks_like_address(query: str) -> bool:
    """Heuristic: query is an address if it contains a number followed by words."""
    q = query.strip()
    # Matches patterns like "123 main st", "45-67 broadway", "111 east 37 street"
    return bool(re.match(r"^\d+[\-\d]*\s+\w", q))


@router.post("/search", response_model=SearchResponse)
async def search_buildings(
    request: SearchRequest,
    db: AsyncSession = Depends(get_db),
):
    """Search buildings by address, BBL, or natural language (AI)."""
    query = request.query.strip()

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

    # Address search (if it looks like an address)
    if looks_like_address(query):
        results = await search_by_address(db, query)
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

    # Try address search as fallback for any query
    results = await search_by_address(db, query)
    if results:
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
            clarification=f"Showing address matches for \"{query}\"",
        )

    # No address matches — try AI search for natural language queries
    try:
        from app.services.search_service import search_buildings_ai
        result = await search_buildings_ai(db, query)
        buildings = [
            BuildingSummaryResponse(
                **_sanitize_row(b),
                grade=score_to_grade(b.get("health_score", 0) if not (isinstance(b.get("health_score"), float) and math.isnan(b.get("health_score", 0))) else 0),
            )
            for b in result["results"]
        ]
        return SearchResponse(
            results=buildings,
            total=result["total"],
            query=result["query"],
            clarification=result.get("clarification"),
        )
    except Exception:
        return SearchResponse(
            results=[],
            total=0,
            query=query,
            clarification="No results found. Try searching by address or BBL.",
        )
