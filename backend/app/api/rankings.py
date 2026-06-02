"""Rankings API — the worst-scoring landlords and buildings citywide.

Powers a public "hall of shame" page that surfaces the lowest-scoring
buildings and the owners with the worst average health scores across their
portfolio. Both endpoints support an optional borough filter.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import (
    WorstBuildingResponse,
    WorstBuildingsListResponse,
    WorstLandlordResponse,
    WorstLandlordsListResponse,
)
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.services.building_service import score_to_grade

router = APIRouter(tags=["rankings"])

# DB stores borough names uppercase (e.g. "STATEN ISLAND").
VALID_BOROUGHS = {"MANHATTAN", "BRONX", "BROOKLYN", "QUEENS", "STATEN ISLAND"}

# Exclude 1-2 family homes (PLUTO class A/B) — same convention as the map/search.
EXCLUDE_SMALL_HOMES = "b.building_class NOT LIKE 'A%' AND b.building_class NOT LIKE 'B%'"


def _normalize_borough(borough: str | None) -> str | None:
    """Validate and normalize a borough filter, or raise 400."""
    if not borough:
        return None
    normalized = borough.strip().upper()
    if normalized not in VALID_BOROUGHS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid borough. Use one of: {', '.join(sorted(VALID_BOROUGHS))}",
        )
    return normalized


@router.get("/rankings/buildings", response_model=WorstBuildingsListResponse)
@limiter.limit("120/minute")
async def worst_buildings(
    request: Request,
    borough: str | None = Query(None, description="Filter to one borough"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Lowest-scoring buildings citywide (or within a borough)."""
    norm_borough = _normalize_borough(borough)

    borough_clause = "AND b.borough = :borough" if norm_borough else ""
    params: dict = {"limit": limit}
    if norm_borough:
        params["borough"] = norm_borough

    result = await db.execute(
        text(f"""
            SELECT
                b.bbl, b.bin, b.address, b.borough, b.neighborhood, b.nta_name,
                hs.composite_score AS health_score,
                b.latitude, b.longitude,
                COALESCE(b.residential_units, 0) AS residential_units,
                b.year_built, b.building_class,
                b.owner_name, b.managing_agent,
                COALESCE(hs.total_violations, 0) AS total_violations,
                COALESCE(hs.total_complaints, 0) AS total_complaints
            FROM buildings b
            JOIN health_scores hs ON hs.building_id = b.id
            WHERE {EXCLUDE_SMALL_HOMES}
                {borough_clause}
            ORDER BY hs.composite_score ASC, hs.total_violations DESC NULLS LAST
            LIMIT :limit
        """),
        params,
    )

    buildings = []
    for row in result:
        r = dict(row._mapping)
        score = r.get("health_score") or 0.0
        buildings.append(
            WorstBuildingResponse(
                **{**r, "health_score": score},
                grade=score_to_grade(score),
            )
        )

    return WorstBuildingsListResponse(
        buildings=buildings, total=len(buildings), borough=norm_borough
    )


@router.get("/rankings/landlords", response_model=WorstLandlordsListResponse)
@limiter.limit("120/minute")
async def worst_landlords(
    request: Request,
    borough: str | None = Query(None, description="Filter to one borough"),
    limit: int = Query(50, ge=1, le=100),
    min_buildings: int = Query(3, ge=1, le=50, description="Min buildings in a portfolio to rank"),
    db: AsyncSession = Depends(get_db),
):
    """Owners with the worst average health score across their portfolio.

    Owners are grouped case-insensitively. Only portfolios with at least
    `min_buildings` scored buildings are ranked, so a single bad building
    doesn't dominate the list.
    """
    norm_borough = _normalize_borough(borough)

    borough_clause = "AND b.borough = :borough" if norm_borough else ""
    params: dict = {"limit": limit, "min_buildings": min_buildings}
    if norm_borough:
        params["borough"] = norm_borough

    result = await db.execute(
        text(f"""
            WITH scored AS (
                SELECT
                    UPPER(TRIM(b.owner_name)) AS owner_key,
                    b.owner_name,
                    b.borough,
                    b.bbl,
                    hs.composite_score,
                    COALESCE(hs.total_violations, 0) AS total_violations,
                    COALESCE(hs.total_complaints, 0) AS total_complaints,
                    COALESCE(b.residential_units, 0) AS residential_units
                FROM buildings b
                JOIN health_scores hs ON hs.building_id = b.id
                WHERE b.owner_name IS NOT NULL
                    AND TRIM(b.owner_name) <> ''
                    AND {EXCLUDE_SMALL_HOMES}
                    {borough_clause}
            )
            SELECT
                MIN(owner_name) AS owner_name,
                COUNT(*) AS building_count,
                AVG(composite_score) AS avg_score,
                SUM(total_violations) AS total_violations,
                SUM(total_complaints) AS total_complaints,
                SUM(residential_units) AS total_units,
                ARRAY_AGG(DISTINCT borough) AS boroughs,
                (ARRAY_AGG(bbl ORDER BY composite_score ASC))[1] AS worst_bbl
            FROM scored
            GROUP BY owner_key
            HAVING COUNT(*) >= :min_buildings
            ORDER BY avg_score ASC, SUM(total_violations) DESC
            LIMIT :limit
        """),
        params,
    )

    landlords = []
    for row in result:
        avg_score = round(row.avg_score or 0.0, 1)
        boroughs = [b for b in (row.boroughs or []) if b]
        landlords.append(
            WorstLandlordResponse(
                owner_name=row.owner_name,
                building_count=row.building_count,
                avg_score=avg_score,
                grade=score_to_grade(avg_score),
                total_violations=int(row.total_violations or 0),
                total_complaints=int(row.total_complaints or 0),
                total_units=int(row.total_units or 0),
                boroughs=sorted(boroughs),
                worst_bbl=row.worst_bbl,
            )
        )

    return WorstLandlordsListResponse(
        landlords=landlords, total=len(landlords), borough=norm_borough
    )
