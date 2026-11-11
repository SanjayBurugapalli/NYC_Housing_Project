"""Rankings API — the worst-scoring landlords and buildings citywide.

Powers a public "hall of shame" page that surfaces the lowest-scoring
buildings and the owners with the worst average health scores across their
portfolio. Both endpoints support an optional borough filter, and a `q` search
that finds any building (by address) or landlord (by name) in the full
ranking, with its rank.
"""

import asyncio
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import (
    WorstBuildingResponse,
    WorstBuildingsListResponse,
    WorstLandlordResponse,
    WorstLandlordsListResponse,
)
from app.api.search import _address_variants
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.services.building_service import score_to_grade
from app.services.entity_matching import normalize_entity_name, normalized_entity_sql

router = APIRouter(tags=["rankings"])

# DB stores borough names uppercase (e.g. "STATEN ISLAND").
VALID_BOROUGHS = {"MANHATTAN", "BRONX", "BROOKLYN", "QUEENS", "STATEN ISLAND"}

# A BBL's first digit is its borough, which lets a rank be counted on
# health_scores alone (no join to buildings).
BOROUGH_BBL_PREFIX = {"MANHATTAN": "1", "BRONX": "2", "BROOKLYN": "3", "QUEENS": "4", "STATEN ISLAND": "5"}

# Landlord grouping: which name column identifies the portfolio.
# Owner names come from PLUTO; managing agents from HPD registration. A landlord
# that registers a separate LLC per building often routes them all through one
# managing agent, so the agent view can reveal portfolios the owner view splits.
GROUP_COLUMNS = {"owner": "b.owner_name", "manager": "b.managing_agent"}

# Exclude 1-2 family homes (PLUTO class A/B) — same convention as the map/search.
EXCLUDE_SMALL_HOMES = "b.building_class NOT LIKE 'A%' AND b.building_class NOT LIKE 'B%'"
# The same pool on health_scores, which carries its building's class.
HS_EXCLUDE_SMALL_HOMES = "hs.building_class NOT LIKE 'A%' AND hs.building_class NOT LIKE 'B%'"

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

SEARCH_QUERY = Query(None, min_length=2, max_length=100)

# The full landlord ranking aggregates every building (1-3s), and it only
# changes when scores are recomputed, so default-weight rankings are kept for
# an hour. The list and its search both read them. Custom weights aren't cached.
LANDLORD_CACHE_TTL_S = 3600
_landlord_cache: dict[tuple, tuple[float, list[dict]]] = {}
_landlord_locks: defaultdict[tuple, asyncio.Lock] = defaultdict(asyncio.Lock)


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


async def _building_ranks(
    db: AsyncSession,
    bbls: list[str],
    borough: str | None,
    score_expr: str,
    weight_params: dict,
    is_custom: bool,
) -> tuple[dict[str, int], int]:
    """Each building's rank (1 = worst) in the full ranking, and the ranking's size.

    Ranks follow the list's order: score ascending, then most violations, then
    BBL. With the stored composite score each rank is two index-backed counts
    of the buildings ahead of it; a custom-weighted score has no index, so the
    whole pool is ranked once instead.
    """
    pool = HS_EXCLUDE_SMALL_HOMES + (" AND hs.bbl LIKE :bbl_prefix" if borough else "")
    params: dict = {"bbls": bbls, **weight_params}
    if borough:
        params["bbl_prefix"] = BOROUGH_BBL_PREFIX[borough] + "%"

    if is_custom:
        result = await db.execute(
            text(f"""
                WITH ranked AS (
                    SELECT hs.bbl,
                           ROW_NUMBER() OVER (
                               ORDER BY {score_expr} ASC, COALESCE(hs.total_violations, 0) DESC, hs.bbl
                           ) AS rank,
                           COUNT(*) OVER () AS ranked_total
                    FROM health_scores hs
                    WHERE {pool}
                )
                SELECT bbl, rank, ranked_total FROM ranked WHERE bbl = ANY(:bbls)
            """),
            params,
        )
        rows = result.all()
        total = rows[0].ranked_total if rows else 0
        return ({r.bbl: r.rank for r in rows}, total)

    result = await db.execute(
        text(f"""
            SELECT m.bbl,
                   1 + (SELECT COUNT(*) FROM health_scores hs
                        WHERE {pool} AND hs.composite_score < m.composite_score)
                     + (SELECT COUNT(*) FROM health_scores hs
                        WHERE {pool} AND hs.composite_score = m.composite_score
                          AND (COALESCE(hs.total_violations, 0) > COALESCE(m.total_violations, 0)
                               OR (COALESCE(hs.total_violations, 0) = COALESCE(m.total_violations, 0)
                                   AND hs.bbl < m.bbl))) AS rank
            FROM health_scores m
            WHERE m.bbl = ANY(:bbls)
        """),
        params,
    )
    ranks = {r.bbl: r.rank for r in result}
    total = (await db.execute(text(f"SELECT COUNT(*) FROM health_scores hs WHERE {pool}"), params)).scalar() or 0
    return (ranks, total)


@router.get("/rankings/buildings", response_model=WorstBuildingsListResponse)
@limiter.limit("120/minute")
async def worst_buildings(
    request: Request,
    borough: str | None = Query(None, description="Filter to one borough"),
    limit: int = Query(50, ge=1, le=100),
    q: str | None = SEARCH_QUERY,
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
    default composite ranking. Pass ``q`` to find buildings by address instead
    of listing the worst: matches come back worst first, each with its rank.
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

    # Address variants (EAST/E, STREET/ST, 19TH/19), served by the trigram index.
    search_clause = ""
    if q:
        variants = _address_variants(q)
        search_clause = "AND (" + " OR ".join(f"b.address ILIKE :addr{i}" for i in range(len(variants))) + ")"
        params.update({f"addr{i}": f"%{v}%" for i, v in enumerate(variants)})

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
                {search_clause}
            ORDER BY health_score ASC, COALESCE(hs.total_violations, 0) DESC, b.bbl
            LIMIT :limit
        """),
        params,
    )
    rows = [dict(row._mapping) for row in result]

    ranked_total = None
    if q:
        ranks, ranked_total = await _building_ranks(
            db, [r["bbl"] for r in rows], norm_borough, score_expr, weight_params, is_custom
        )
    else:
        ranks = {r["bbl"]: i + 1 for i, r in enumerate(rows)}

    buildings = []
    for r in rows:
        score = r.get("health_score") or 0.0
        buildings.append(
            WorstBuildingResponse(
                **{**r, "health_score": score},
                grade=score_to_grade(score),
                rank=ranks[r["bbl"]],
            )
        )

    return WorstBuildingsListResponse(
        buildings=buildings, total=len(buildings), borough=norm_borough, query=q, ranked_total=ranked_total
    )


async def _landlord_ranking(
    db: AsyncSession,
    group_by: str,
    borough: str | None,
    min_buildings: int,
    score_expr: str,
    weight_params: dict,
) -> list[dict]:
    """Every portfolio with `min_buildings`+ scored buildings, worst average first."""
    col = GROUP_COLUMNS[group_by]
    borough_clause = "AND b.borough = :borough" if borough else ""
    params: dict = {"min_buildings": min_buildings, **weight_params}
    if borough:
        params["borough"] = borough

    result = await db.execute(
        text(f"""
            WITH scored AS (
                SELECT
                    {normalized_entity_sql(col)} AS entity_key,
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
                entity_key,
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
            ORDER BY avg_score ASC, SUM(total_violations) DESC, entity_key
        """),
        params,
    )
    return [dict(row._mapping) for row in result]


async def _cached_landlord_ranking(
    db: AsyncSession, group_by: str, borough: str | None, min_buildings: int
) -> list[dict]:
    key = (group_by, borough, min_buildings)
    hit = _landlord_cache.get(key)
    if hit and time.monotonic() - hit[0] < LANDLORD_CACHE_TTL_S:
        return hit[1]
    # One computation per key at a time; requests that arrive meanwhile wait for it.
    async with _landlord_locks[key]:
        hit = _landlord_cache.get(key)
        if hit and time.monotonic() - hit[0] < LANDLORD_CACHE_TTL_S:
            return hit[1]
        ranking = await _landlord_ranking(db, group_by, borough, min_buildings, "hs.composite_score", {})
        _landlord_cache[key] = (time.monotonic(), ranking)
        return ranking


@router.get("/rankings/landlords", response_model=WorstLandlordsListResponse)
@limiter.limit("120/minute")
async def worst_landlords(
    request: Request,
    borough: str | None = Query(None, description="Filter to one borough"),
    group_by: str = Query("owner", description="Group portfolios by 'owner' or 'manager'"),
    limit: int = Query(50, ge=1, le=100),
    min_buildings: int = Query(3, ge=1, le=50, description="Min buildings in a portfolio to rank"),
    q: str | None = SEARCH_QUERY,
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
    score across each portfolio instead of the default composite. Pass ``q`` to
    find landlords by name (normalized the same way) instead of listing the
    worst: matches come back worst first, each with its rank.
    """
    norm_borough = _normalize_borough(borough)

    if group_by not in GROUP_COLUMNS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid group_by. Use one of: {', '.join(sorted(GROUP_COLUMNS))}",
        )

    weights, is_custom = _resolve_weights(
        {
            "w_heat": w_heat, "w_pest": w_pest, "w_structural": w_structural,
            "w_hpd": w_hpd, "w_noise": w_noise, "w_litigation": w_litigation,
        }
    )
    if is_custom:
        score_expr, weight_params = _score_sql(weights, is_custom)
        ranking = await _landlord_ranking(db, group_by, norm_borough, min_buildings, score_expr, weight_params)
    else:
        ranking = await _cached_landlord_ranking(db, group_by, norm_borough, min_buildings)

    ranked = list(enumerate(ranking, start=1))
    if q:
        # "ABC Realty LLC" searches as "ABC", like the grouping itself.
        needle = normalize_entity_name(q)
        ranked = [(rank, r) for rank, r in ranked if needle and needle in r["entity_key"]]

    landlords = []
    for rank, row in ranked[:limit]:
        avg_score = round(row["avg_score"] or 0.0, 1)
        boroughs = [b for b in (row["boroughs"] or []) if b]
        landlords.append(
            WorstLandlordResponse(
                owner_name=row["owner_name"],
                building_count=row["building_count"],
                avg_score=avg_score,
                grade=score_to_grade(avg_score),
                total_violations=int(row["total_violations"] or 0),
                total_complaints=int(row["total_complaints"] or 0),
                total_units=int(row["total_units"] or 0),
                boroughs=sorted(boroughs),
                worst_bbl=row["worst_bbl"],
                rank=rank,
            )
        )

    return WorstLandlordsListResponse(
        landlords=landlords,
        total=len(landlords),
        borough=norm_borough,
        group_by=group_by,
        query=q,
        ranked_total=len(ranking),
    )
