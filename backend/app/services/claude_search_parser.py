"""Claude-based natural language search parser.

Uses Claude Haiku 4.5 with the tool-use pattern to translate a free-form
search query into the structured filter dict that ``execute_search`` accepts.

Design notes
------------
* Tool-use with ``tool_choice`` forced to the ``search_buildings`` tool
  guarantees the response contains exactly one structured payload.
* On any failure (missing key, network error, malformed response) we return
  ``None`` so the caller can fall back to the deterministic rule-based parser.
* The system prompt + tool schema is marked with ``cache_control`` so repeated
  queries hit the prompt cache once the prefix exceeds Haiku's threshold.
"""

from __future__ import annotations

import logging
from typing import Any

import anthropic
from anthropic import AsyncAnthropic

from app.core.config import MAX_RESULTS, settings

logger = logging.getLogger(__name__)

# Haiku 4.5 — fastest + cheapest Claude tier; sufficient for structured extraction.
CLAUDE_MODEL = "claude-haiku-4-5"

VALID_COMPLAINT_TYPES = ["heat", "pest", "noise", "structural", "hpd_a", "hpd_b", "hpd_c"]

# Sort columns whitelisted in execute_search (mirrors _ALLOWED_SORT_COLUMNS there).
SORT_COLUMNS = [
    "hs.composite_score",
    "hs.noise_score",
    "hs.pest_rodent_score",
    "hs.heat_hot_water_score",
    "hs.structural_safety_score",
    "hs.hpd_severity_score",
    "hs.litigation_score",
    "hs.total_complaints",
    "hs.total_violations",
]

SEARCH_TOOL = {
    "name": "search_buildings",
    "description": (
        "Build a structured filter for searching NYC residential buildings "
        "based on the user's natural language query. Omit any field the "
        "query does not mention."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "borough": {
                "type": "string",
                "enum": ["MANHATTAN", "BRONX", "BROOKLYN", "QUEENS", "STATEN ISLAND"],
                "description": "NYC borough name in uppercase. Set only if the user names a specific borough.",
            },
            "neighborhood": {
                "type": "string",
                "description": (
                    "Neighborhood name as commonly written (e.g. 'Astoria', "
                    "'Williamsburg', 'Upper East Side'). Used for substring matching."
                ),
            },
            "complaint_types": {
                "type": "array",
                "items": {"type": "string", "enum": VALID_COMPLAINT_TYPES},
                "description": (
                    "Complaint categories the buildings should have. Use when the "
                    "user wants buildings with these problems (e.g. 'rat-infested' → ['pest'])."
                ),
            },
            "exclude_complaint_types": {
                "type": "array",
                "items": {"type": "string", "enum": VALID_COMPLAINT_TYPES},
                "description": (
                    "Complaint categories to exclude. Use when the user negates a "
                    "complaint (e.g. 'no rats', 'pest-free', 'without heat issues')."
                ),
            },
            "min_score": {
                "type": "integer", "minimum": 0, "maximum": 100,
                "description": "Minimum composite health score. Use 80 for 'best'/'healthy'.",
            },
            "max_score": {
                "type": "integer", "minimum": 0, "maximum": 100,
                "description": "Maximum composite health score. Use 50 for 'worst'/'unhealthy'.",
            },
            "has_litigation": {
                "type": "boolean",
                "description": "True when user mentions lawsuits, litigation, sued, etc.",
            },
            "min_units": {
                "type": "integer", "minimum": 1,
                "description": "Minimum residential units (use 50 for 'large'/'high-rise').",
            },
            "max_units": {
                "type": "integer", "minimum": 1,
                "description": "Maximum residential units (use 10 for 'small'/'walk-up').",
            },
            "min_year_built": {
                "type": "integer",
                "description": "Minimum year. 'post-war' → 1946, 'new construction' → 2010.",
            },
            "max_year_built": {
                "type": "integer",
                "description": "Maximum year. 'pre-war' → 1945, 'old building' → 1950.",
            },
            "building_classes": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Building class codes. Single letter = prefix match (e.g. 'D' = "
                    "all elevator apartments). Common: A=1-family, B=2-family, "
                    "C=walk-up, D=elevator, R=condo, H=hotel."
                ),
            },
            "owner_name": {
                "type": "string",
                "description": "Owner/landlord name when user says 'owned by X' or names a landlord.",
            },
            "sort": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "column": {"type": "string", "enum": SORT_COLUMNS},
                        "order": {"type": "string", "enum": ["ASC", "DESC"]},
                    },
                    "required": ["column", "order"],
                },
                "description": (
                    "Ordered sort columns. Higher score = healthier building, so "
                    "'quiet' → noise_score DESC, 'noisy' → noise_score ASC, "
                    "'best' → composite_score DESC, 'worst' → composite_score ASC."
                ),
            },
            "limit": {
                "type": "integer", "minimum": 1, "maximum": MAX_RESULTS,
                "description": f"Result limit. 'top 5' → 5. Default {MAX_RESULTS} if omitted.",
            },
        },
        "additionalProperties": False,
    },
}

SYSTEM_PROMPT = """You translate natural language queries about NYC residential buildings into structured search filters.

Domain context:
- Boroughs: MANHATTAN, BRONX, BROOKLYN, QUEENS, STATEN ISLAND.
- Health scores are 0-100 where HIGHER = HEALTHIER (fewer complaints, fewer violations).
- Composite columns: hs.composite_score (overall), hs.noise_score, hs.pest_rodent_score,
  hs.heat_hot_water_score, hs.structural_safety_score, hs.hpd_severity_score, hs.litigation_score.
- Complaint categories: heat, pest, noise, structural, hpd_a, hpd_b, hpd_c.

Sort intent rules:
- "best" / "healthiest" / "good" → composite_score DESC
- "worst" / "unhealthy" / "bad" → composite_score ASC
- "quiet" → noise_score DESC (high score = no noise issues)
- "noisy" / "loud" → noise_score ASC
- "no rats" / "pest-free" → exclude_complaint_types=["pest"], sort pest_rodent_score DESC
- "with rats" / "rat-infested" → complaint_types=["pest"], sort pest_rodent_score ASC

Call the search_buildings tool exactly once with whatever filters apply. Do not add fields the query does not mention."""


async def parse_query_with_claude(query: str) -> dict[str, Any] | None:
    """Send ``query`` to Claude and return the parsed filter dict.

    Returns ``None`` if the API key is missing, the request fails, or the
    response is not in the expected shape. Callers should fall back to the
    deterministic rule-based parser in that case.
    """
    if not settings.anthropic_api_key:
        return None

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    try:
        response = await client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=1024,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=[SEARCH_TOOL],
            tool_choice={"type": "tool", "name": "search_buildings"},
            messages=[{"role": "user", "content": query}],
        )
    except anthropic.APIError as e:
        logger.warning("Claude search parse failed for query=%r: %s", query, e)
        return None
    except Exception as e:  # network errors, unexpected SDK errors
        logger.warning("Claude search parse unexpected error for query=%r: %s", query, e)
        return None

    for block in response.content:
        if getattr(block, "type", None) == "tool_use" and block.name == "search_buildings":
            raw = block.input if isinstance(block.input, dict) else {}
            return _normalize_claude_filters(raw)

    logger.warning("Claude response had no tool_use block for query=%r", query)
    return None


def _normalize_claude_filters(raw: dict) -> dict:
    """Map Claude's tool input to the filter keys ``execute_search`` expects.

    The schema is mostly identical; the one rename is ``neighborhood`` →
    ``nta_name`` (the column name used for the ILIKE match in SQL).
    """
    out: dict = {}
    passthrough = (
        "borough", "complaint_types", "exclude_complaint_types",
        "min_score", "max_score", "has_litigation",
        "min_units", "max_units", "min_year_built", "max_year_built",
        "building_classes", "owner_name", "sort", "limit",
    )
    for key in passthrough:
        if key in raw and raw[key] is not None:
            out[key] = raw[key]

    if raw.get("neighborhood"):
        out["nta_name"] = raw["neighborhood"]

    return out


def claude_confidence(filters: dict) -> float:
    """Confidence proxy based on how many entity filters Claude returned."""
    entity_keys = {
        "borough", "nta_name", "complaint_types", "exclude_complaint_types",
        "min_score", "max_score", "has_litigation", "min_units", "max_units",
        "min_year_built", "max_year_built", "building_classes", "owner_name",
    }
    matched = len(entity_keys & set(filters.keys()))
    if matched == 0:
        return 0.3
    if matched == 1:
        return 0.7
    return min(0.95, 0.55 + 0.1 * matched)
