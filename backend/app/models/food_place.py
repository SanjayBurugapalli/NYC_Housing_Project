from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Float, Index, SmallInteger, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class FoodPlace(Base):
    """A deli, grocery, or restaurant for the "Food nearby" layer.

    Restaurants come from DOHMH restaurant inspections, delis/groceries from NY
    State retail food store licenses (data/ingest/pull_food.py). price_tier
    (1–3) is an estimate from store type, chain, and cuisine — no free price
    source is licensed for display on a Mapbox map.
    """

    __tablename__ = "food_places"

    # "dohmh:<camis>" or "nys:<license_number>"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(20))  # deli | grocery | restaurant
    subtype: Mapped[str | None] = mapped_column(String(80))
    price_tier: Mapped[int | None] = mapped_column(SmallInteger)
    source: Mapped[str] = mapped_column(String(20))
    address: Mapped[str | None] = mapped_column(String(200))
    borough: Mapped[str | None] = mapped_column(String(20))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    geom: Mapped[str] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=False)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("idx_food_places_geog", text("(geom::geography)"), postgresql_using="gist"),
        Index("idx_food_places_source", "source"),
    )
