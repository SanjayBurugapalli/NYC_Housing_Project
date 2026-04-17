import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import settings
from app.api.buildings import router as buildings_router
from app.api.neighborhoods import router as neighborhoods_router
from app.api.search import router as search_router

# Configure structured JSON-style logging
logging.basicConfig(
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":%(message)s}',
    level=logging.INFO,
)
logger = logging.getLogger("nyc_buildings")

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown


app = FastAPI(
    title="NYC Building Health Score",
    description="API for NYC residential building health scores",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
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
    return response


app.include_router(buildings_router, prefix="/api")
app.include_router(neighborhoods_router, prefix="/api")
app.include_router(search_router, prefix="/api")


@app.get("/health")
async def health_check():
    return {"status": "ok"}
