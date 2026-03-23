from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import BuildingSummaryResponse, SearchRequest, SearchResponse
from app.core.database import get_db
from app.services.search_service import search_buildings_ai

router = APIRouter(tags=["search"])


@router.post("/search", response_model=SearchResponse)
async def search_buildings(
    request: SearchRequest,
    db: AsyncSession = Depends(get_db),
):
    """AI-powered natural language search using Claude tool-use."""
    result = await search_buildings_ai(db, request.query)

    buildings = [BuildingSummaryResponse(**b) for b in result["results"]]

    return SearchResponse(
        results=buildings,
        total=result["total"],
        query=result["query"],
        clarification=result.get("clarification"),
    )
