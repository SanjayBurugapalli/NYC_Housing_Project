"""Delis, groceries and restaurants within walking distance of a building."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import FoodNearbyResponse
from app.core.database import get_db
from app.core.rate_limit import limiter

router = APIRouter(tags=["food"])

MAX_PLACES = 200
PRICE_NOTE = "Prices are estimates based on store type, chain and cuisine."

# Walking time from straight-line distance: ~80 m/min, ×1.25 for the street grid.
_WALK_METERS_PER_MIN = 80
_GRID_DETOUR = 1.25

_CENTER = "ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography"


def walk_minutes(distance_m: float, minimum: int = 0) -> int:
    return max(minimum, round(distance_m * _GRID_DETOUR / _WALK_METERS_PER_MIN))


@router.get("/buildings/{bbl}/food", response_model=FoodNearbyResponse)
@limiter.limit("120/minute")
async def food_nearby(
    request: Request,
    bbl: str,
    radius_m: int = Query(400, ge=100, le=1200),
    db: AsyncSession = Depends(get_db),
):
    """Food places within `radius_m` meters (default ≈ a 5-minute walk), nearest first."""
    if len(bbl) != 10 or not bbl.isdigit():
        raise HTTPException(status_code=400, detail="BBL must be a 10-digit number")

    building = (await db.execute(
        text("SELECT latitude, longitude FROM buildings WHERE bbl = :bbl"),
        {"bbl": bbl},
    )).first()
    if not building or building.latitude is None or building.longitude is None:
        raise HTTPException(status_code=404, detail="Building not found")

    params = {"lat": building.latitude, "lng": building.longitude, "radius": radius_m}
    within = f"ST_DWithin(geom::geography, {_CENTER}, :radius)"

    counts_rows = await db.execute(
        text(f"SELECT category, COUNT(*) AS n FROM food_places WHERE {within} GROUP BY category"),
        params,
    )
    counts = {row.category: int(row.n) for row in counts_rows}

    place_rows = await db.execute(
        text(f"""
            SELECT id, name, category, subtype, price_tier, address, latitude, longitude,
                   ST_Distance(geom::geography, {_CENTER}) AS distance_m
            FROM food_places
            WHERE {within}
            ORDER BY distance_m
            LIMIT :max_places
        """),
        {**params, "max_places": MAX_PLACES},
    )
    places = [
        {
            "id": row.id,
            "name": row.name,
            "category": row.category,
            "subtype": row.subtype,
            "price_tier": row.price_tier,
            "latitude": row.latitude,
            "longitude": row.longitude,
            "distance_m": round(row.distance_m),
            "walk_min": walk_minutes(row.distance_m, minimum=1),
            "address": row.address,
        }
        for row in place_rows
    ]

    return FoodNearbyResponse(
        radius_m=radius_m,
        walk_minutes=walk_minutes(radius_m),
        center={"latitude": building.latitude, "longitude": building.longitude},
        counts=counts,
        places=places,
        price_note=PRICE_NOTE,
    )
