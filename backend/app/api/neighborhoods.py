import json
import math
import time
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import NeighborhoodListResponse, NeighborhoodResponse
from app.api.neighborhood_names import get_neighborhood_name
from app.api.sub_neighborhood_splits import SUB_NEIGHBORHOOD_SPLITS
from app.core.database import get_db

router = APIRouter(tags=["neighborhoods"])

# In-memory caches — computed on first request, reused thereafter.
_sub_cache: Optional[list[dict]] = None

# The polygon endpoint aggregates ~800k buildings (≈700ms), so it's cached, but
# with a TTL rather than forever: the API service does NOT restart when the
# nightly refresh cron recomputes scores, so a permanent cache would freeze the
# neighborhood choropleth at deploy-time values. The TTL bounds that staleness
# to a few hours after each nightly run.
_polygon_cache: Optional[dict] = None
_polygon_cache_at: float = 0.0
_POLYGON_CACHE_TTL_SECONDS = 3 * 3600

# Simplify tolerance (degrees, ~40m) for NTA outline geometry. Drops the raw
# ~2MB of boundary coordinates to ~170KB while staying visually crisp at the
# zoom levels (≤13) where outlines are shown.
_POLYGON_SIMPLIFY_TOLERANCE = 0.0004


class SubNeighborhoodResponse(BaseModel):
    name: str
    avg_score: float
    building_count: int
    centroid: list[float]  # [lng, lat]


class SubNeighborhoodListResponse(BaseModel):
    sub_neighborhoods: list[SubNeighborhoodResponse]


@router.get("/neighborhoods", response_model=NeighborhoodListResponse)
async def list_neighborhoods(
    db: AsyncSession = Depends(get_db),
):
    """Pre-computed neighborhood-level aggregate scores."""
    result = await db.execute(
        text("""
            SELECT name, borough, avg_health_score, building_count,
                   centroid_lat, centroid_lng
            FROM neighborhoods
            WHERE avg_health_score IS NOT NULL
            ORDER BY avg_health_score ASC
        """)
    )

    neighborhoods = []
    for row in result:
        # Skip rows with NaN coordinates or NaN names
        if not row.centroid_lat or not row.centroid_lng:
            continue
        if math.isnan(row.centroid_lat) or math.isnan(row.centroid_lng):
            continue
        if row.name and row.name.startswith("NaN"):
            continue
        score = row.avg_health_score or 0
        if math.isnan(score):
            continue

        display_name = get_neighborhood_name(row.name, row.borough)

        neighborhoods.append(
            NeighborhoodResponse(
                name=display_name,
                borough=row.borough,
                avg_score=round(score, 1),
                building_count=row.building_count or 0,
                centroid=[row.centroid_lng, row.centroid_lat],
            )
        )

    return NeighborhoodListResponse(neighborhoods=neighborhoods)


@router.get("/neighborhoods/detail", response_model=SubNeighborhoodListResponse)
async def list_sub_neighborhoods(db: AsyncSession = Depends(get_db)):
    """Per-sub-neighborhood average scores, computed by assigning each building
    to its nearest sub-neighborhood centroid within its community district."""
    global _sub_cache
    if _sub_cache is not None:
        return SubNeighborhoodListResponse(sub_neighborhoods=_sub_cache)

    cd_codes = list(SUB_NEIGHBORHOOD_SPLITS.keys())

    result = await db.execute(
        text("""
            SELECT b.neighborhood, b.latitude, b.longitude,
                   COALESCE(hs.composite_score, 0) AS score
            FROM buildings b
            LEFT JOIN health_scores hs ON hs.building_id = b.id
            WHERE b.latitude  IS NOT NULL
              AND b.longitude IS NOT NULL
              AND b.neighborhood = ANY(:cd_codes)
              AND b.building_class NOT LIKE 'A%'
              AND b.building_class NOT LIKE 'B%'
        """),
        {"cd_codes": cd_codes},
    )

    # Group buildings by CD code
    buildings_by_cd: dict[str, list[dict]] = defaultdict(list)
    for row in result:
        buildings_by_cd[row.neighborhood].append(
            {"lat": row.latitude, "lng": row.longitude, "score": row.score}
        )

    sub_list: list[dict] = []
    for cd_code, splits in SUB_NEIGHBORHOOD_SPLITS.items():
        buildings = buildings_by_cd.get(cd_code, [])
        if not buildings:
            continue

        # Assign each building to the nearest centroid (squared Euclidean — no sqrt needed)
        sub_scores: dict[str, list[float]] = {s["name"]: [] for s in splits}
        for b in buildings:
            nearest = min(
                splits,
                key=lambda s: (b["lat"] - s["lat"]) ** 2 + (b["lng"] - s["lng"]) ** 2,
            )
            sub_scores[nearest["name"]].append(b["score"])

        for sub in splits:
            scores = sub_scores[sub["name"]]
            sub_list.append({
                "name": sub["name"],
                "avg_score": round(sum(scores) / len(scores), 1) if scores else 0.0,
                "building_count": len(scores),
                "centroid": [sub["lng"], sub["lat"]],
            })

    _sub_cache = sub_list
    return SubNeighborhoodListResponse(sub_neighborhoods=sub_list)


@router.get("/neighborhoods/polygons")
async def neighborhood_polygons(db: AsyncSession = Depends(get_db)) -> dict:
    """NTA neighborhood boundaries with aggregated health scores, as GeoJSON.

    Returns a FeatureCollection of (simplified) NTA polygons, each carrying the
    average composite score and building count for that neighborhood. The map
    renders these as filled, outlined neighborhood shapes at low/medium zoom —
    a more precise replacement for the old centroid bubbles. 1–2 family homes
    (PLUTO class A/B) are excluded to match the building-level map and the CD
    aggregates.
    """
    global _polygon_cache, _polygon_cache_at
    if _polygon_cache is not None and (time.monotonic() - _polygon_cache_at) < _POLYGON_CACHE_TTL_SECONDS:
        return _polygon_cache

    result = await db.execute(
        text(
            """
            WITH agg AS (
                SELECT b.nta_code,
                       AVG(hs.composite_score) AS avg_score,
                       COUNT(*) AS building_count
                FROM buildings b
                JOIN health_scores hs ON hs.building_id = b.id
                WHERE b.nta_code IS NOT NULL
                  AND b.building_class NOT LIKE 'A%'
                  AND b.building_class NOT LIKE 'B%'
                GROUP BY b.nta_code
            )
            SELECT n.nta_code, n.nta_name, n.borough,
                   agg.avg_score, agg.building_count,
                   ST_AsGeoJSON(ST_SimplifyPreserveTopology(n.geom, :tol)) AS geom
            FROM nta_boundaries n
            JOIN agg ON agg.nta_code = n.nta_code
            WHERE agg.building_count > 0
        """
        ),
        {"tol": _POLYGON_SIMPLIFY_TOLERANCE},
    )

    features = []
    for row in result:
        if row.geom is None or row.avg_score is None:
            continue
        score = round(row.avg_score, 1)
        if math.isnan(score):
            continue
        features.append(
            {
                "type": "Feature",
                "geometry": json.loads(row.geom),
                "properties": {
                    "nta_code": row.nta_code,
                    "name": row.nta_name,
                    "borough": row.borough,
                    "avg_score": score,
                    "building_count": int(row.building_count or 0),
                },
            }
        )

    _polygon_cache = {"type": "FeatureCollection", "features": features}
    _polygon_cache_at = time.monotonic()
    return _polygon_cache
