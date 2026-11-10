"""Commute time from a building to the user's workplace (transit + walking)."""

from fastapi import APIRouter, HTTPException, Query, Request

from app.api.schemas import CommuteResponse
from app.core.rate_limit import limiter
from app.services.commute_service import CommuteUpstreamError, get_commute

router = APIRouter(tags=["commute"])

# Both endpoints must fall inside this NYC-area box (includes the Hudson
# waterfront so a Jersey City office still routes).
_LAT_RANGE = (40.40, 41.10)
_LNG_RANGE = (-74.40, -73.60)


def _in_area(lat: float, lng: float) -> bool:
    return _LAT_RANGE[0] <= lat <= _LAT_RANGE[1] and _LNG_RANGE[0] <= lng <= _LNG_RANGE[1]


@router.get("/commute", response_model=CommuteResponse)
@limiter.limit("30/minute")
async def commute(
    request: Request,
    from_lat: float = Query(...),
    from_lng: float = Query(...),
    to_lat: float = Query(...),
    to_lng: float = Query(...),
):
    """Weekday-morning door-to-door trip by transit and on foot (fastest wins), via Transitous."""
    if not (_in_area(from_lat, from_lng) and _in_area(to_lat, to_lng)):
        raise HTTPException(status_code=422, detail="Both points must be in New York City.")

    try:
        result = await get_commute(from_lat, from_lng, to_lat, to_lng)
    except CommuteUpstreamError:
        raise HTTPException(status_code=502, detail="Transit routing is unavailable right now.")

    if result is None:
        raise HTTPException(status_code=404, detail="No transit route found between these points.")
    return CommuteResponse(**result)
