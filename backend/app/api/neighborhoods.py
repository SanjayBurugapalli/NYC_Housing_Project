import math
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

# In-memory cache — computed once on first request, reused thereafter
_sub_cache: Optional[list[dict]] = None


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
