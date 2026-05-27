from fastapi import APIRouter, Depends, HTTPException, Query, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import BuildingDetailResponse, BuildingListResponse, BuildingSummaryResponse
from app.core.database import get_db
from app.services.building_service import get_building_detail, get_buildings_in_viewport

router = APIRouter(tags=["buildings"])
limiter = Limiter(key_func=get_remote_address)

# NYC geographic bounds — clamp bbox requests to prevent full-table scans
NYC_BOUNDS = {"west": -74.3, "south": 40.45, "east": -73.65, "north": 40.95}


@router.get("/buildings", response_model=BuildingListResponse)
@limiter.limit("300/minute")
async def list_buildings(
    request: Request,
    bbox: str | None = Query(None, description="west,south,east,north"),
    zoom: int = Query(12, ge=1, le=22),
    include_small_homes: bool = Query(False, description="Include 1-2 family homes (PLUTO class A/B)"),
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

    # Clamp to NYC bounds to prevent full-table scans
    west = max(west, NYC_BOUNDS["west"])
    south = max(south, NYC_BOUNDS["south"])
    east = min(east, NYC_BOUNDS["east"])
    north = min(north, NYC_BOUNDS["north"])

    rows = await get_buildings_in_viewport(
        db, west, south, east, north, zoom, include_small_homes=include_small_homes
    )

    buildings = [BuildingSummaryResponse(**row) for row in rows]
    return BuildingListResponse(buildings=buildings, total=len(buildings))


@router.get("/buildings/{bbl}", response_model=BuildingDetailResponse)
@limiter.limit("120/minute")
async def get_building(
    request: Request,
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
