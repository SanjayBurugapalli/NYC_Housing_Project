from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class HealthScore(Base):
    __tablename__ = "health_scores"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    building_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("buildings.id"), unique=True, nullable=False
    )
    bbl: Mapped[str] = mapped_column(String(10), unique=True, nullable=False, index=True)

    # Composite score
    composite_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Sub-scores (0-100 each)
    heat_hot_water_score: Mapped[float] = mapped_column(Float, default=100.0)
    pest_rodent_score: Mapped[float] = mapped_column(Float, default=100.0)
    structural_safety_score: Mapped[float] = mapped_column(Float, default=100.0)
    hpd_severity_score: Mapped[float] = mapped_column(Float, default=100.0)
    noise_score: Mapped[float] = mapped_column(Float, default=100.0)
    litigation_score: Mapped[float] = mapped_column(Float, default=100.0)
    age_maintenance_score: Mapped[float] = mapped_column(Float, default=100.0)

    # Percentile rank within building class
    percentile_rank: Mapped[float | None] = mapped_column(Float)
    building_class: Mapped[str | None] = mapped_column(String(10))

    # Raw counts (for transparency)
    total_complaints: Mapped[int | None] = mapped_column(BigInteger, default=0)
    total_violations: Mapped[int | None] = mapped_column(BigInteger, default=0)
    complaints_per_unit: Mapped[float | None] = mapped_column(Float, default=0.0)
    violations_per_unit: Mapped[float | None] = mapped_column(Float, default=0.0)

    # Timestamps
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    building: Mapped["Building"] = relationship(back_populates="health_score")  # noqa: F821

    __table_args__ = (
        Index("idx_health_scores_composite", "composite_score"),
        Index("idx_health_scores_class_score", "building_class", "composite_score"),
    )
