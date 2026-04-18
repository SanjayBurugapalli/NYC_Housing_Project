from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class FDNYViolation(Base):
    __tablename__ = "fdny_violations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    external_id: Mapped[str | None] = mapped_column(String(50), unique=True)

    bbl: Mapped[str | None] = mapped_column(String(10), index=True)
    bin: Mapped[str | None] = mapped_column(String(7), index=True)

    violation_number: Mapped[str | None] = mapped_column(String(50))
    violation_type: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(String(50))
    violation_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    close_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    address: Mapped[str | None] = mapped_column(String(200))
    borough: Mapped[str | None] = mapped_column(String(20))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("idx_fdny_violations_bbl", "bbl"),
        Index("idx_fdny_violations_bin", "bin"),
        Index("idx_fdny_violations_date", "violation_date"),
    )
