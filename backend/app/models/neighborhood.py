from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import BigInteger, DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Neighborhood(Base):
    __tablename__ = "neighborhoods"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    borough: Mapped[str] = mapped_column(String(20), nullable=False)

    # Aggregate stats
    avg_health_score: Mapped[float | None] = mapped_column(Float)
    median_health_score: Mapped[float | None] = mapped_column(Float)
    building_count: Mapped[int | None] = mapped_column(Integer, default=0)
    total_complaints: Mapped[int | None] = mapped_column(BigInteger, default=0)
    total_violations: Mapped[int | None] = mapped_column(BigInteger, default=0)

    # Centroid for map display
    centroid: Mapped[str | None] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326), nullable=True
    )
    centroid_lat: Mapped[float | None] = mapped_column(Float)
    centroid_lng: Mapped[float | None] = mapped_column(Float)

    # Timestamps
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
    )
