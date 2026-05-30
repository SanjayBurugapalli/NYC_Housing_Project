import hashlib

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.models.analytics import AnalyticsEvent, Feedback

router = APIRouter(tags=["analytics"])

ALLOWED_EVENT_TYPES = {"search", "building_view", "compare"}


def _hash_value(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


class EventRequest(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=50)
    data: dict | None = None


class FeedbackRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    rating: int | None = Field(None, ge=1, le=5)
    email: str | None = Field(None, max_length=200)
    page_context: str | None = Field(None, max_length=100)


@router.post("/events", status_code=204)
@limiter.limit("120/minute")
async def track_event(
    request: Request,
    body: EventRequest,
    db: AsyncSession = Depends(get_db),
):
    if body.event_type not in ALLOWED_EVENT_TYPES:
        raise HTTPException(status_code=422, detail=f"Unknown event_type: {body.event_type}")

    ip_raw = request.client.host if request.client else ""
    ua_raw = request.headers.get("user-agent", "")

    event = AnalyticsEvent(
        event_type=body.event_type,
        data=body.data,
        ip_hash=_hash_value(ip_raw) if ip_raw else None,
        user_agent_hash=_hash_value(ua_raw) if ua_raw else None,
    )
    db.add(event)
    await db.commit()
    return Response(status_code=204)


@router.post("/feedback")
@limiter.limit("10/minute")
async def submit_feedback(
    request: Request,
    body: FeedbackRequest,
    db: AsyncSession = Depends(get_db),
):
    fb = Feedback(
        message=body.message,
        rating=body.rating,
        email=body.email,
        page_context=body.page_context,
    )
    db.add(fb)
    await db.commit()
    return {"success": True}


@router.get("/admin/analytics")
async def admin_analytics(
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    if not settings.admin_token or token != settings.admin_token:
        raise HTTPException(status_code=403, detail="Forbidden")

    total_events_row = await db.execute(text("SELECT COUNT(*) FROM analytics_events"))
    total_events = total_events_row.scalar()

    by_type = await db.execute(text("""
        SELECT event_type, COUNT(*) as count
        FROM analytics_events
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY event_type
        ORDER BY count DESC
    """))
    events_by_type = {row.event_type: row.count for row in by_type}

    top_searches = await db.execute(text("""
        SELECT data->>'query' as query, COUNT(*) as count
        FROM analytics_events
        WHERE event_type = 'search'
          AND created_at >= NOW() - INTERVAL '30 days'
          AND data->>'query' IS NOT NULL
        GROUP BY data->>'query'
        ORDER BY count DESC
        LIMIT 20
    """))
    top_search_queries = [
        {"query": row.query, "count": row.count} for row in top_searches
    ]

    daily_trend = await db.execute(text("""
        SELECT DATE(created_at AT TIME ZONE 'UTC') as day, COUNT(*) as count
        FROM analytics_events
        WHERE created_at >= NOW() - INTERVAL '14 days'
        GROUP BY day
        ORDER BY day ASC
    """))
    event_trend = [
        {"day": str(row.day), "count": row.count} for row in daily_trend
    ]

    fb_total = await db.execute(text("SELECT COUNT(*) FROM feedback"))
    total_feedback = fb_total.scalar()

    recent_fb = await db.execute(text("""
        SELECT id, message, rating, email, page_context, created_at
        FROM feedback
        ORDER BY created_at DESC
        LIMIT 10
    """))
    recent_feedback = [
        {
            "id": row.id,
            "message": row.message,
            "rating": row.rating,
            "email": row.email,
            "page_context": row.page_context,
            "created_at": str(row.created_at),
        }
        for row in recent_fb
    ]

    return {
        "total_events": total_events,
        "events_by_type_last_30d": events_by_type,
        "top_search_queries_last_30d": top_search_queries,
        "event_trend_last_14d": event_trend,
        "total_feedback": total_feedback,
        "recent_feedback": recent_feedback,
    }
