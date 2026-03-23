from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.buildings import router as buildings_router
from app.api.neighborhoods import router as neighborhoods_router
from app.api.search import router as search_router


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(buildings_router, prefix="/api")
app.include_router(neighborhoods_router, prefix="/api")
app.include_router(search_router, prefix="/api")


@app.get("/health")
async def health_check():
    return {"status": "ok"}
