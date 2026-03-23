from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import BuildingDetailResponse, BuildingListResponse, BuildingSummaryResponse
from app.core.database import get_db
from app.services.building_service import get_building_detail, get_buildings_in_viewport

router = APIRouter(tags=["buildings"])


@router.get("/buildings", response_model=BuildingListResponse)
async def list_buildings(
    bbox: str | None = Query(None, description="west,south,east,north"),
    zoom: int = Query(12, ge=1, le=22),
    db: AsyncSession = Depends(get_db),
):
    """Return buildings visible in map viewport. Zoom-dependent response."""
    if not bbox:
        return BuildingListResponse(buildings=[], total=0)

    try:
        parts = [float(x.strip()) for x in bbox.split(",")]
        west, south, east, north = parts
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Invalid bbox format. Use: west,south,east,north")

    rows = await get_buildings_in_viewport(db, west, south, east, north, zoom)

    buildings = [BuildingSummaryResponse(**row) for row in rows]
    return BuildingListResponse(buildings=buildings, total=len(buildings))


@router.get("/buildings/{bbl}", response_model=BuildingDetailResponse)
async def get_building(
    bbl: str,
    db: AsyncSession = Depends(get_db),
):
    """Full detail for one building including score breakdown."""
    if len(bbl) != 10 or not bbl.isdigit():
        raise HTTPException(status_code=400, detail="BBL must be a 10-digit number")

    detail = await get_building_detail(db, bbl)
    if not detail:
        raise HTTPException(status_code=404, detail="Building not found")

    return BuildingDetailResponse(**detail)
