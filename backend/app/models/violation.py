from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Violation(Base):
    __tablename__ = "violations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    external_id: Mapped[str | None] = mapped_column(String(50), unique=True)

    # Link to building
    building_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("buildings.id"), index=True
    )
    bbl: Mapped[str | None] = mapped_column(String(10), index=True)
    bin: Mapped[str | None] = mapped_column(String(7), index=True)

    # Source: "HPD", "DOB"
    source: Mapped[str] = mapped_column(String(10), nullable=False)

    # Violation details
    violation_type: Mapped[str | None] = mapped_column(String(100))
    severity: Mapped[str | None] = mapped_column(String(5))  # HPD: A, B, C
    order_number: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str | None] = mapped_column(String(50))
    status_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    description: Mapped[str | None] = mapped_column(Text)

    # Categorization for scoring
    category: Mapped[str | None] = mapped_column(String(50))

    # Dates
    inspection_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    original_certify_by_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    original_correct_by_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    building: Mapped["Building | None"] = relationship(back_populates="violations")  # noqa: F821

    __table_args__ = (
        Index("idx_violations_bbl_date", "bbl", "inspection_date"),
        Index("idx_violations_source_severity", "source", "severity"),
        Index("idx_violations_category", "category"),
    )
