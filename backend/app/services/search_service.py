"""AI-powered search using Claude API with tool-use pattern.

Translates natural language queries into structured database queries.
"""

import json
import logging

import anthropic
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

logger = logging.getLogger(__name__)

SEARCH_TOOL = {
    "name": "search_buildings",
    "description": (
        "Search NYC residential buildings by various filters. "
        "Returns buildings matching the criteria with their health scores."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "borough": {
                "type": "string",
                "enum": ["MANHATTAN", "BRONX", "BROOKLYN", "QUEENS", "STATEN ISLAND"],
                "description": "NYC borough to filter by",
            },
            "neighborhood": {
                "type": "string",
                "description": "Neighborhood name to filter by",
            },
            "min_score": {
                "type": "number",
                "minimum": 0,
                "maximum": 100,
                "description": "Minimum health score (0-100, higher is healthier)",
            },
            "max_score": {
                "type": "number",
                "minimum": 0,
                "maximum": 100,
                "description": "Maximum health score (0-100, higher is healthier)",
            },
            "complaint_types": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": ["heat", "pest", "noise", "structural", "hpd_a", "hpd_b", "hpd_c"],
                },
                "description": "Filter by specific complaint/violation categories",
            },
            "min_units": {
                "type": "integer",
                "minimum": 1,
                "description": "Minimum residential units",
            },
            "max_units": {
                "type": "integer",
                "description": "Maximum residential units",
            },
            "min_year_built": {
                "type": "integer",
                "description": "Minimum year built",
            },
            "max_year_built": {
                "type": "integer",
                "description": "Maximum year built",
            },
            "building_class": {
                "type": "string",
                "description": "Building class code to filter by",
            },
            "has_litigation": {
                "type": "boolean",
                "description": "Filter to buildings with/without litigation history",
            },
            "sort_by": {
                "type": "string",
                "enum": ["score_asc", "score_desc", "complaints", "violations"],
                "description": "How to sort results",
            },
        },
    },
}

VALID_BOROUGHS = {"MANHATTAN", "BRONX", "BROOKLYN", "QUEENS", "STATEN ISLAND"}
MAX_RESULTS = 100


async def search_buildings_ai(
    db: AsyncSession, query: str
) -> dict:
    """Use Claude to translate natural language into a structured search."""

    if not settings.anthropic_api_key:
        return {
            "results": [],
            "total": 0,
            "query": query,
            "clarification": "AI search is not configured. Please set the ANTHROPIC_API_KEY.",
        }

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    # Send query to Claude with tool definition
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=(
            "You help users search for NYC residential buildings. "
            "Translate their natural language queries into structured search filters. "
            "Use the search_buildings tool to specify filters. "
            "If the query is too vague, still make your best attempt but use broad filters. "
            "For 'worst' or 'unhealthy' buildings, use low score ranges. "
            "For 'best' or 'healthy' buildings, use high score ranges."
        ),
        messages=[{"role": "user", "content": query}],
        tools=[SEARCH_TOOL],
    )

    # Extract tool use from response
    filters = {}
    clarification = None

    for block in response.content:
        if block.type == "tool_use" and block.name == "search_buildings":
            filters = block.input
        elif block.type == "text" and block.text:
            clarification = block.text

    if not filters:
        return {
            "results": [],
            "total": 0,
            "query": query,
            "clarification": clarification or "Could not understand the search query. Please try rephrasing.",
        }

    # Validate filters
    filters = validate_filters(filters)

    # Execute query
    results = await execute_search(db, filters)

    return {
        "results": results,
        "total": len(results),
        "query": query,
        "clarification": clarification,
    }


def validate_filters(filters: dict) -> dict:
    """Validate and sanitize Claude-generated filter values."""
    validated = {}

    if "borough" in filters and filters["borough"] in VALID_BOROUGHS:
        validated["borough"] = filters["borough"]

    if "neighborhood" in filters and isinstance(filters["neighborhood"], str):
        validated["neighborhood"] = filters["neighborhood"][:100]

    for key in ["min_score", "max_score"]:
        if key in filters and isinstance(filters[key], (int, float)):
            validated[key] = max(0, min(100, filters[key]))

    valid_categories = {"heat", "pest", "noise", "structural", "hpd_a", "hpd_b", "hpd_c"}
    if "complaint_types" in filters and isinstance(filters["complaint_types"], list):
        validated["complaint_types"] = [
            ct for ct in filters["complaint_types"] if ct in valid_categories
        ]

    for key in ["min_units", "max_units"]:
        if key in filters and isinstance(filters[key], int):
            validated[key] = max(1, min(10000, filters[key]))

    for key in ["min_year_built", "max_year_built"]:
        if key in filters and isinstance(filters[key], int):
            validated[key] = max(1800, min(2030, filters[key]))

    if "building_class" in filters and isinstance(filters["building_class"], str):
        validated["building_class"] = filters["building_class"][:10]

    if "has_litigation" in filters and isinstance(filters["has_litigation"], bool):
        validated["has_litigation"] = filters["has_litigation"]

    if "sort_by" in filters and filters["sort_by"] in {
        "score_asc", "score_desc", "complaints", "violations"
    }:
        validated["sort_by"] = filters["sort_by"]

    return validated


async def execute_search(db: AsyncSession, filters: dict) -> list[dict]:
    """Execute validated search filters against the database."""
    conditions = []
    params: dict = {"limit": MAX_RESULTS}

    if "borough" in filters:
        conditions.append("b.borough = :borough")
        params["borough"] = filters["borough"]

    if "neighborhood" in filters:
        conditions.append("b.neighborhood ILIKE :neighborhood")
        params["neighborhood"] = f"%{filters['neighborhood']}%"

    if "min_score" in filters:
        conditions.append("hs.composite_score >= :min_score")
        params["min_score"] = filters["min_score"]

    if "max_score" in filters:
        conditions.append("hs.composite_score <= :max_score")
        params["max_score"] = filters["max_score"]

    if "min_units" in filters:
        conditions.append("b.residential_units >= :min_units")
        params["min_units"] = filters["min_units"]

    if "max_units" in filters:
        conditions.append("b.residential_units <= :max_units")
        params["max_units"] = filters["max_units"]

    if "min_year_built" in filters:
        conditions.append("b.year_built >= :min_year_built")
        params["min_year_built"] = filters["min_year_built"]

    if "max_year_built" in filters:
        conditions.append("b.year_built <= :max_year_built")
        params["max_year_built"] = filters["max_year_built"]

    if "building_class" in filters:
        conditions.append("b.building_class = :building_class")
        params["building_class"] = filters["building_class"]

    if filters.get("complaint_types"):
        conditions.append("""
            EXISTS (
                SELECT 1 FROM complaints c
                WHERE c.bbl = b.bbl AND c.category = ANY(:complaint_types)
            )
        """)
        params["complaint_types"] = filters["complaint_types"]

    if "has_litigation" in filters:
        if filters["has_litigation"]:
            conditions.append("EXISTS (SELECT 1 FROM litigations l WHERE l.bbl = b.bbl)")
        else:
            conditions.append("NOT EXISTS (SELECT 1 FROM litigations l WHERE l.bbl = b.bbl)")

    # Build sort clause
    sort_map = {
        "score_asc": "hs.composite_score ASC NULLS LAST",
        "score_desc": "hs.composite_score DESC NULLS LAST",
        "complaints": "hs.total_complaints DESC NULLS LAST",
        "violations": "hs.total_violations DESC NULLS LAST",
    }
    order_by = sort_map.get(filters.get("sort_by", ""), "hs.composite_score ASC NULLS LAST")

    where_clause = " AND ".join(conditions) if conditions else "TRUE"

    query = text(f"""
        SELECT
            b.bbl, b.bin, b.address, b.borough, b.neighborhood,
            COALESCE(hs.composite_score, 0) as health_score,
            b.latitude, b.longitude,
            b.residential_units, b.year_built, b.building_class
        FROM buildings b
        LEFT JOIN health_scores hs ON hs.building_id = b.id
        WHERE {where_clause}
        ORDER BY {order_by}
        LIMIT :limit
    """)

    result = await db.execute(query, params)
    return [dict(row._mapping) for row in result]
