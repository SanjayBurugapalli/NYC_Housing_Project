import logging
import os
import time
import uuid
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine
from app.core.rate_limit import limiter
from app.api.analytics import router as analytics_router
from app.api.buildings import router as buildings_router
from app.api.neighborhoods import router as neighborhoods_router
from app.api.refresh_status import router as refresh_status_router
from app.api.search import router as search_router

# Initialize Sentry before FastAPI() so lifespan and import-time errors are captured.
# DSN unset (e.g. local dev) → SDK is a no-op.
_sentry_dsn = os.environ.get("SENTRY_DSN")
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
        release=os.environ.get("RAILWAY_GIT_COMMIT_SHA"),
        integrations=[
            StarletteIntegration(),
            FastApiIntegration(),
            SqlalchemyIntegration(),
        ],
        # Capture 10% of transactions for perf tracing. Tune via SENTRY_TRACES_SAMPLE_RATE.
        traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
        # Do NOT send PII (request headers, IPs) by default; flip on if needed for debugging.
        send_default_pii=False,
    )

# Configure structured JSON-style logging
logging.basicConfig(
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":%(message)s}',
    level=logging.INFO,
)
logger = logging.getLogger("nyc_buildings")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info('"msg":"DB connection OK"')
    except Exception as e:
        # Log only the exception class — full str(e) can include the DSN
        # (host/port) on asyncpg connection failures.
        logger.error('"msg":"DB connection FAILED: %s"', type(e).__name__)
    yield


app = FastAPI(
    title="BeforeYouRent API",
    description="API for NYC residential building health scores",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

ALLOWED_ORIGINS = {o.strip() for o in settings.allowed_origins.split(",") if o.strip()}
CORS_STATIC_HEADERS = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
}


def _origin_headers(request_origin: str | None) -> dict[str, str]:
    """Headers to set on responses. Echoes the request Origin if allowlisted; sets Vary so caches don't cross-serve."""
    headers = {"Vary": "Origin", **CORS_STATIC_HEADERS}
    if request_origin and request_origin in ALLOWED_ORIGINS:
        headers["Access-Control-Allow-Origin"] = request_origin
    return headers


@app.middleware("http")
async def handle_cors_and_logging(request: Request, call_next):
    origin = request.headers.get("origin")

    if request.method == "OPTIONS":
        from starlette.responses import Response
        return Response(status_code=204, headers=_origin_headers(origin))

    request_id = str(uuid.uuid4())[:8]
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = round((time.monotonic() - start) * 1000)
    logger.info(
        '"request_id":"%s","method":"%s","path":"%s","status":%d,"duration_ms":%d,"ip":"%s"',
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        request.client.host if request.client else "unknown",
    )
    response.headers["X-Request-Id"] = request_id
    for k, v in _origin_headers(origin).items():
        response.headers[k] = v
    return response


app.include_router(analytics_router, prefix="/api")
app.include_router(buildings_router, prefix="/api")
app.include_router(neighborhoods_router, prefix="/api")
app.include_router(refresh_status_router, prefix="/api")
app.include_router(search_router, prefix="/api")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


# TEMPORARY: deliberately raise an unhandled error to verify Sentry captures
# backend exceptions end-to-end. Returns 500. Remove once verified.
@app.get("/api/debug/sentry-trigger")
async def _sentry_trigger():
    raise RuntimeError("sentry backend smoke test — safe to ignore")
