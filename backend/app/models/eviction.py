from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Eviction(Base):
    __tablename__ = "evictions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    external_id: Mapped[str | None] = mapped_column(String(100), unique=True)

    bbl: Mapped[str | None] = mapped_column(String(10), index=True)

    address: Mapped[str | None] = mapped_column(String(200))
    borough: Mapped[str | None] = mapped_column(String(20))
    apartment_no: Mapped[str | None] = mapped_column(String(20))
    respondent: Mapped[str | None] = mapped_column(String(200))
    executed_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    marshal_name: Mapped[str | None] = mapped_column(String(200))
    eviction_type: Mapped[str | None] = mapped_column(String(50))
    residential_commercial: Mapped[str | None] = mapped_column(String(20))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("idx_evictions_bbl", "bbl"),
        Index("idx_evictions_date", "executed_date"),
    )
