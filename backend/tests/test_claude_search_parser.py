"""Tests for the Claude-based search parser.

The Anthropic SDK is mocked — no network calls. Each test exercises one
behavior: happy path, error fallback, missing key, missing tool_use block,
and the neighborhood→nta_name normalization.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import anthropic
import pytest

from app.services import claude_search_parser
from app.services.claude_search_parser import (
    _normalize_claude_filters,
    claude_confidence,
    parse_query_with_claude,
)


def _mock_response(tool_input: dict | None, *, block_type: str = "tool_use", tool_name: str = "search_buildings"):
    """Build a fake Message whose .content is one tool_use block."""
    block = SimpleNamespace(type=block_type, name=tool_name, input=tool_input or {})
    return SimpleNamespace(content=[block])


@pytest.fixture
def mock_client(monkeypatch):
    """Patch AsyncAnthropic so .messages.create is a controllable AsyncMock."""
    monkeypatch.setattr(claude_search_parser.settings, "anthropic_api_key", "test-key")
    client = MagicMock()
    client.messages.create = AsyncMock()
    with patch.object(claude_search_parser, "AsyncAnthropic", return_value=client):
        yield client


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


async def test_parse_simple_borough_query(mock_client):
    mock_client.messages.create.return_value = _mock_response({
        "borough": "BROOKLYN",
        "sort": [{"column": "hs.composite_score", "order": "DESC"}],
    })

    result = await parse_query_with_claude("best buildings in Brooklyn")

    assert result is not None
    assert result["borough"] == "BROOKLYN"
    assert result["sort"][0]["order"] == "DESC"


async def test_parse_complex_query(mock_client):
    mock_client.messages.create.return_value = _mock_response({
        "borough": "QUEENS",
        "neighborhood": "Astoria",
        "exclude_complaint_types": ["pest"],
        "min_units": 50,
        "max_year_built": 1945,
        "sort": [
            {"column": "hs.pest_rodent_score", "order": "DESC"},
            {"column": "hs.composite_score", "order": "DESC"},
        ],
    })

    result = await parse_query_with_claude(
        "pre-war pest-free high-rises in Astoria, Queens"
    )

    assert result["borough"] == "QUEENS"
    assert result["nta_name"] == "Astoria"  # renamed from `neighborhood`
    assert "neighborhood" not in result
    assert result["exclude_complaint_types"] == ["pest"]
    assert result["min_units"] == 50
    assert result["max_year_built"] == 1945


async def test_request_uses_haiku_model_and_forces_tool(mock_client):
    mock_client.messages.create.return_value = _mock_response({"borough": "MANHATTAN"})

    await parse_query_with_claude("Manhattan")

    call = mock_client.messages.create.call_args
    assert call.kwargs["model"] == "claude-haiku-4-5"
    assert call.kwargs["tool_choice"] == {"type": "tool", "name": "search_buildings"}
    # System prompt is cached for prefix reuse across queries
    assert call.kwargs["system"][0]["cache_control"] == {"type": "ephemeral"}


# ---------------------------------------------------------------------------
# Fallback paths — these MUST return None so the caller can fall back
# ---------------------------------------------------------------------------


async def test_missing_api_key_returns_none(monkeypatch):
    monkeypatch.setattr(claude_search_parser.settings, "anthropic_api_key", "")
    result = await parse_query_with_claude("any query")
    assert result is None


async def test_api_error_returns_none(mock_client):
    mock_client.messages.create.side_effect = anthropic.APIError(
        message="upstream failure",
        request=MagicMock(),
        body=None,
    )
    result = await parse_query_with_claude("any query")
    assert result is None


async def test_unexpected_exception_returns_none(mock_client):
    mock_client.messages.create.side_effect = RuntimeError("boom")
    result = await parse_query_with_claude("any query")
    assert result is None


async def test_response_with_no_tool_use_returns_none(mock_client):
    # Claude returned plain text instead of using the tool — defensive case
    mock_client.messages.create.return_value = _mock_response(None, block_type="text")
    result = await parse_query_with_claude("anything")
    assert result is None


# ---------------------------------------------------------------------------
# Normalization (pure function, no client needed)
# ---------------------------------------------------------------------------


def test_normalize_strips_none_values():
    raw = {"borough": "BROOKLYN", "neighborhood": None, "min_units": None}
    out = _normalize_claude_filters(raw)
    assert out == {"borough": "BROOKLYN"}


def test_normalize_passes_through_all_supported_fields():
    raw = {
        "borough": "BRONX",
        "complaint_types": ["heat"],
        "exclude_complaint_types": ["noise"],
        "min_score": 80,
        "max_score": 95,
        "has_litigation": True,
        "min_units": 10,
        "max_units": 100,
        "min_year_built": 1900,
        "max_year_built": 2000,
        "building_classes": ["D"],
        "owner_name": "Acme Realty",
        "sort": [{"column": "hs.composite_score", "order": "DESC"}],
        "limit": 25,
    }
    out = _normalize_claude_filters(raw)
    for k, v in raw.items():
        assert out[k] == v


def test_normalize_renames_neighborhood():
    raw = {"neighborhood": "Williamsburg"}
    out = _normalize_claude_filters(raw)
    assert out == {"nta_name": "Williamsburg"}


# ---------------------------------------------------------------------------
# Confidence scoring
# ---------------------------------------------------------------------------


def test_confidence_low_when_no_entities():
    assert claude_confidence({"sort": []}) == 0.3


def test_confidence_increases_with_entity_count():
    one = claude_confidence({"borough": "X"})
    three = claude_confidence({"borough": "X", "nta_name": "Y", "min_units": 5})
    assert one < three
    assert three <= 0.95
