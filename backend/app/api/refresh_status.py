from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

router = APIRouter(tags=["refresh-status"])

# A dataset is considered stale if its last successful refresh is older than this.
STALE_AFTER_HOURS = 36


class DatasetRefreshStatus(BaseModel):
    dataset: str
    last_completed_at: datetime | None = None
    last_status: str | None = None
    rows_changed: int | None = None
    duration_seconds: int | None = None


class RefreshStatusResponse(BaseModel):
    datasets: list[DatasetRefreshStatus]
    overall_last_updated: datetime | None = None
    any_stale: bool = False


@router.get("/refresh-status", response_model=RefreshStatusResponse)
async def get_refresh_status(db: AsyncSession = Depends(get_db)):
    """Return per-dataset refresh status plus an aggregate freshness summary."""
    result = await db.execute(
        text("""
            SELECT dataset, last_completed_at, last_status,
                   rows_changed, duration_seconds
            FROM data_refresh_status
            ORDER BY dataset
        """)
    )

    datasets = [
        DatasetRefreshStatus(
            dataset=row.dataset,
            last_completed_at=row.last_completed_at,
            last_status=row.last_status,
            rows_changed=row.rows_changed,
            duration_seconds=row.duration_seconds,
        )
        for row in result
    ]

    success_completions = [
        d.last_completed_at for d in datasets
        if d.last_status == "success" and d.last_completed_at is not None
    ]
    overall = max(success_completions) if success_completions else None

    stale_cutoff = datetime.now(timezone.utc) - timedelta(hours=STALE_AFTER_HOURS)
    any_stale = any(
        d.last_status == "fail"
        or d.last_completed_at is None
        or d.last_completed_at < stale_cutoff
        for d in datasets
    )

    return RefreshStatusResponse(
        datasets=datasets,
        overall_last_updated=overall,
        any_stale=any_stale,
    )
