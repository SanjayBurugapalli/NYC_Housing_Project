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
from app.services.entity_matching import normalized_entity_sql

router = APIRouter(tags=["rankings"])

# DB stores borough names uppercase (e.g. "STATEN ISLAND").
VALID_BOROUGHS = {"MANHATTAN", "BRONX", "BROOKLYN", "QUEENS", "STATEN ISLAND"}

# Landlord grouping: which name column identifies the portfolio.
# Owner names come from PLUTO; managing agents from HPD registration. A landlord
# that registers a separate LLC per building often routes them all through one
# managing agent, so the agent view can reveal portfolios the owner view splits.
GROUP_COLUMNS = {"owner": "b.owner_name", "manager": "b.managing_agent"}

# Exclude 1-2 family homes (PLUTO class A/B) — same convention as the map/search.
EXCLUDE_SMALL_HOMES = "b.building_class NOT LIKE 'A%' AND b.building_class NOT LIKE 'B%'"

# Custom scoring: each ranking can be re-weighted so a user can prioritize what
# matters to them (e.g. weight Pest + Heat higher). Maps each weight query param
# to its health_scores sub-score column and the canonical default weight (these
# defaults mirror WEIGHTS in data/scoring/compute.py and sum to 1.0, so the
# default-weight expression reproduces the stored composite_score).
WEIGHT_PARAMS: dict[str, tuple[str, float]] = {
    "w_heat": ("heat_hot_water_score", 0.20),
    "w_pest": ("pest_rodent_score", 0.22),
    "w_structural": ("structural_safety_score", 0.20),
    "w_hpd": ("hpd_severity_score", 0.20),
    "w_noise": ("noise_score", 0.05),
    "w_litigation": ("litigation_score", 0.13),
}


def _resolve_weights(raw: dict[str, float | None]) -> tuple[dict[str, float], bool]:
    """Normalize the six weight params into (weights, is_custom).

    Each weight is clamped to [0, 1]. If the caller supplied none of them — or
    everything sums to zero — we fall back to the canonical defaults and report
    ``is_custom=False`` so the ranking keeps using the stored composite_score.
    """
    if all(v is None for v in raw.values()):
        return ({k: d for k, (_, d) in WEIGHT_PARAMS.items()}, False)

    weights = {
        k: max(0.0, min(1.0, raw[k])) if raw.get(k) is not None else 0.0
        for k in WEIGHT_PARAMS
    }
    if sum(weights.values()) <= 0:
        return ({k: d for k, (_, d) in WEIGHT_PARAMS.items()}, False)
    return (weights, True)


def _score_sql(weights: dict[str, float], is_custom: bool) -> tuple[str, dict]:
    """Return (sql_expression, bind_params) for the building-level score.

    Non-custom → the stored ``hs.composite_score`` (no recompute). Custom → a
    normalized weighted blend of the sub-scores: sum(score_i * w_i) / sum(w_i),
    so the result stays on the same 0-100 scale regardless of the weight total.
    Sub-scores are COALESCEd to 100 (a missing sub-score means "no issues"),
    matching the frontend's per-building custom-score math.
    """
    if not is_custom:
        return ("hs.composite_score", {})

    terms = " + ".join(
        f"COALESCE(hs.{col}, 100) * :{k}" for k, (col, _) in WEIGHT_PARAMS.items()
    )
    params: dict = dict(weights)
    params["w_total"] = sum(weights.values())
    return (f"(({terms}) / :w_total)", params)


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
    w_heat: float | None = Query(None, ge=0, le=1, description="Custom weight: heat/hot water"),
    w_pest: float | None = Query(None, ge=0, le=1, description="Custom weight: pest/rodent"),
    w_structural: float | None = Query(None, ge=0, le=1, description="Custom weight: structural (DOB)"),
    w_hpd: float | None = Query(None, ge=0, le=1, description="Custom weight: HPD severity"),
    w_noise: float | None = Query(None, ge=0, le=1, description="Custom weight: noise"),
    w_litigation: float | None = Query(None, ge=0, le=1, description="Custom weight: litigation"),
    db: AsyncSession = Depends(get_db),
):
    """Lowest-scoring buildings citywide (or within a borough).

    Pass any of the ``w_*`` weights to re-rank by a custom-weighted score so a
    user can prioritize the categories they care about; omit them for the
    default composite ranking.
    """
    norm_borough = _normalize_borough(borough)

    weights, is_custom = _resolve_weights(
        {
            "w_heat": w_heat, "w_pest": w_pest, "w_structural": w_structural,
            "w_hpd": w_hpd, "w_noise": w_noise, "w_litigation": w_litigation,
        }
    )
    score_expr, weight_params = _score_sql(weights, is_custom)

    borough_clause = "AND b.borough = :borough" if norm_borough else ""
    params: dict = {"limit": limit, **weight_params}
    if norm_borough:
        params["borough"] = norm_borough

    result = await db.execute(
        text(f"""
            SELECT
                b.bbl, b.bin, b.address, b.borough, b.neighborhood, b.nta_name,
                {score_expr} AS health_score,
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
            ORDER BY health_score ASC, hs.total_violations DESC NULLS LAST
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
    group_by: str = Query("owner", description="Group portfolios by 'owner' or 'manager'"),
    limit: int = Query(50, ge=1, le=100),
    min_buildings: int = Query(3, ge=1, le=50, description="Min buildings in a portfolio to rank"),
    w_heat: float | None = Query(None, ge=0, le=1, description="Custom weight: heat/hot water"),
    w_pest: float | None = Query(None, ge=0, le=1, description="Custom weight: pest/rodent"),
    w_structural: float | None = Query(None, ge=0, le=1, description="Custom weight: structural (DOB)"),
    w_hpd: float | None = Query(None, ge=0, le=1, description="Custom weight: HPD severity"),
    w_noise: float | None = Query(None, ge=0, le=1, description="Custom weight: noise"),
    w_litigation: float | None = Query(None, ge=0, le=1, description="Custom weight: litigation"),
    db: AsyncSession = Depends(get_db),
):
    """Landlords with the worst average health score across their portfolio.

    Names are normalized (legal-entity suffixes and punctuation stripped) so
    variants like "ABC Realty LLC" and "ABC Realty Corp" group together. Only
    portfolios with at least `min_buildings` scored buildings are ranked, so a
    single bad building doesn't dominate the list. Set `group_by=manager` to
    group by HPD managing agent instead of PLUTO owner.

    Pass any of the ``w_*`` weights to average a custom-weighted per-building
    score across each portfolio instead of the default composite.
    """
    norm_borough = _normalize_borough(borough)

    col = GROUP_COLUMNS.get(group_by)
    if col is None:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid group_by. Use one of: {', '.join(sorted(GROUP_COLUMNS))}",
        )
    entity_key_sql = normalized_entity_sql(col)

    weights, is_custom = _resolve_weights(
        {
            "w_heat": w_heat, "w_pest": w_pest, "w_structural": w_structural,
            "w_hpd": w_hpd, "w_noise": w_noise, "w_litigation": w_litigation,
        }
    )
    score_expr, weight_params = _score_sql(weights, is_custom)

    borough_clause = "AND b.borough = :borough" if norm_borough else ""
    params: dict = {"limit": limit, "min_buildings": min_buildings, **weight_params}
    if norm_borough:
        params["borough"] = norm_borough

    result = await db.execute(
        text(f"""
            WITH scored AS (
                SELECT
                    {entity_key_sql} AS entity_key,
                    {col} AS entity_name,
                    b.borough,
                    b.bbl,
                    {score_expr} AS composite_score,
                    COALESCE(hs.total_violations, 0) AS total_violations,
                    COALESCE(hs.total_complaints, 0) AS total_complaints,
                    COALESCE(b.residential_units, 0) AS residential_units
                FROM buildings b
                JOIN health_scores hs ON hs.building_id = b.id
                WHERE {col} IS NOT NULL
                    AND TRIM({col}) <> ''
                    AND {EXCLUDE_SMALL_HOMES}
                    {borough_clause}
            )
            SELECT
                MIN(entity_name) AS owner_name,
                COUNT(*) AS building_count,
                AVG(composite_score) AS avg_score,
                SUM(total_violations) AS total_violations,
                SUM(total_complaints) AS total_complaints,
                SUM(residential_units) AS total_units,
                ARRAY_AGG(DISTINCT borough) AS boroughs,
                (ARRAY_AGG(bbl ORDER BY composite_score ASC))[1] AS worst_bbl
            FROM scored
            WHERE entity_key IS NOT NULL
            GROUP BY entity_key
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
        landlords=landlords, total=len(landlords), borough=norm_borough, group_by=group_by
    )
