from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Litigation(Base):
    __tablename__ = "litigations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    external_id: Mapped[str | None] = mapped_column(String(50), unique=True)

    # Link to building
    building_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("buildings.id"), index=True
    )
    bbl: Mapped[str | None] = mapped_column(String(10), index=True)

    # Litigation details
    case_type: Mapped[str | None] = mapped_column(String(100))
    case_status: Mapped[str | None] = mapped_column(String(50))
    case_open_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    case_close_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    case_judgment: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    respondent: Mapped[str | None] = mapped_column(String(200))
    penalty: Mapped[str | None] = mapped_column(String(100))

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    building: Mapped["Building | None"] = relationship(back_populates="litigations")  # noqa: F821

    __table_args__ = (
        Index("idx_litigations_bbl", "bbl"),
        Index("idx_litigations_case_open", "case_open_date"),
    )
