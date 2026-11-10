from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Complaint(Base):
    __tablename__ = "complaints"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    external_id: Mapped[str | None] = mapped_column(String(50), unique=True)

    # Link to building
    building_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("buildings.id"), index=True
    )
    bbl: Mapped[str | None] = mapped_column(String(10), index=True)
    bin: Mapped[str | None] = mapped_column(String(7), index=True)

    # Source: "311", "HPD", "DOB"
    source: Mapped[str] = mapped_column(String(10), nullable=False)

    # Complaint details
    complaint_type: Mapped[str | None] = mapped_column(String(100))
    descriptor: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str | None] = mapped_column(String(50))
    status_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    description: Mapped[str | None] = mapped_column(Text)

    # Address (for 311 complaints that need address matching)
    address: Mapped[str | None] = mapped_column(String(200))
    borough: Mapped[str | None] = mapped_column(String(20))

    # Categorization for scoring
    category: Mapped[str | None] = mapped_column(String(50))  # heat, pest, noise, etc.

    # Dates
    created_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_days: Mapped[int | None] = mapped_column(Integer)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    building: Mapped["Building | None"] = relationship(back_populates="complaints")  # noqa: F821

    __table_args__ = (
        Index("idx_complaints_bbl_date", "bbl", "created_date"),
        Index("idx_complaints_source_type", "source", "complaint_type"),
        Index("idx_complaints_category", "category"),
        # Per-building complaint-type search filters (migration 009).
        Index("idx_complaints_bbl_category", "bbl", "category"),
        Index("idx_complaints_created_date", "created_date"),
    )
