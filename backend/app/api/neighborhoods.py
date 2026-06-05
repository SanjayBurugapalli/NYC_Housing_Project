import json
import math
import time
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

router = APIRouter(tags=["neighborhoods"])

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


@router.get("/neighborhoods/polygons")
async def neighborhood_polygons(db: AsyncSession = Depends(get_db)) -> dict:
    """NTA neighborhood boundaries with aggregated health scores, as GeoJSON.

    Returns a FeatureCollection of (simplified) NTA polygons, each carrying the
    average composite score and building count for that neighborhood. The map
    renders these as filled, outlined neighborhood shapes at low/medium zoom.
    1–2 family homes (PLUTO class A/B) are excluded to match the building-level
    map.
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
