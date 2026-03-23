from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Float, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RodentInspection(Base):
    __tablename__ = "rodent_inspections"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    external_id: Mapped[str | None] = mapped_column(String(50), unique=True)

    # Address-based join (no BBL in rodent dataset)
    address: Mapped[str | None] = mapped_column(String(200))
    borough: Mapped[str | None] = mapped_column(String(20))
    zipcode: Mapped[str | None] = mapped_column(String(5))
    bbl: Mapped[str | None] = mapped_column(String(10), index=True)  # Populated after address matching

    # Inspection details
    inspection_type: Mapped[str | None] = mapped_column(String(100))
    result: Mapped[str | None] = mapped_column(String(100))
    approved_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    description: Mapped[str | None] = mapped_column(Text)

    # Location
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)

    # Dates
    inspection_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("idx_rodent_bbl", "bbl"),
        Index("idx_rodent_address", "address"),
        Index("idx_rodent_inspection_date", "inspection_date"),
    )
