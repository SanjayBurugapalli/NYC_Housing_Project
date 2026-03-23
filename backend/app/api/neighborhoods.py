from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import NeighborhoodListResponse, NeighborhoodResponse
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

    neighborhoods = [
        NeighborhoodResponse(
            name=row.name,
            borough=row.borough,
            avg_score=row.avg_health_score or 0,
            building_count=row.building_count or 0,
            centroid=[row.centroid_lng, row.centroid_lat] if row.centroid_lat else [],
        )
        for row in result
    ]

    return NeighborhoodListResponse(neighborhoods=neighborhoods)
