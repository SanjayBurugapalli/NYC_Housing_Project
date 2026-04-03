import math

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import NeighborhoodListResponse, NeighborhoodResponse
from app.api.neighborhood_names import get_neighborhood_name
from app.core.database import get_db

router = APIRouter(tags=["neighborhoods"])


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
