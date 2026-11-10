from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import BigInteger, DateTime, Float, Index, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Building(Base):
    __tablename__ = "buildings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    bbl: Mapped[str] = mapped_column(String(10), unique=True, nullable=False, index=True)
    bin: Mapped[str | None] = mapped_column(String(7), index=True)

    # Address
    house_number: Mapped[str | None] = mapped_column(String(20))
    street_name: Mapped[str | None] = mapped_column(String(100))
    borough: Mapped[str | None] = mapped_column(String(20))
    zipcode: Mapped[str | None] = mapped_column(String(5))
    address: Mapped[str | None] = mapped_column(String(200))
    neighborhood: Mapped[str | None] = mapped_column(String(100))

    # Building info (from PLUTO)
    residential_units: Mapped[int | None] = mapped_column(Integer, default=0)
    total_units: Mapped[int | None] = mapped_column(Integer, default=0)
    year_built: Mapped[int | None] = mapped_column(Integer)
    year_altered: Mapped[int | None] = mapped_column(Integer)
    building_class: Mapped[str | None] = mapped_column(String(10))
    building_class_category: Mapped[str | None] = mapped_column(String(50))
    land_use: Mapped[str | None] = mapped_column(String(10))
    num_floors: Mapped[float | None] = mapped_column(Float)
    lot_area: Mapped[float | None] = mapped_column(Float)
    building_area: Mapped[float | None] = mapped_column(Float)
    owner_name: Mapped[str | None] = mapped_column(String(200))

    # Geometry (EPSG:4326)
    geom: Mapped[str | None] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326), nullable=True
    )
    geom_footprint: Mapped[str | None] = mapped_column(
        Geometry(geometry_type="MULTIPOLYGON", srid=4326), nullable=True
    )

    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    complaints: Mapped[list["Complaint"]] = relationship(back_populates="building")  # noqa: F821
    violations: Mapped[list["Violation"]] = relationship(back_populates="building")  # noqa: F821
    litigations: Mapped[list["Litigation"]] = relationship(back_populates="building")  # noqa: F821
    health_score: Mapped["HealthScore | None"] = relationship(back_populates="building")  # noqa: F821

    __table_args__ = (
        Index("idx_buildings_geom", "geom", postgresql_using="gist"),
        Index("idx_buildings_borough_class", "borough", "building_class"),
        Index("idx_buildings_neighborhood", "neighborhood"),
        # Owner-portfolio lookups match LOWER(owner_name) (migration 008).
        Index("idx_buildings_owner_name_lower", text("lower(owner_name)")),
    )
