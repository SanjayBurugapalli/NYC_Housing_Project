"""Integration tests for the search_buildings_ai dispatcher.

Verifies the rule-based-first / Claude-on-escalation contract without hitting
the database. The DB session and ``execute_search`` are both stubbed.
"""

from __future__ import annotations

import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Project codebase uses PEP 604 (X | None) — Python 3.10+ required.
pytestmark = pytest.mark.skipif(
    sys.version_info < (3, 10),
    reason="search_service uses PEP 604 union syntax (requires Python 3.10+)",
)

if sys.version_info >= (3, 10):
    from app.services import search_service


@pytest.fixture(autouse=True)
def reset_cache():
    """Clear the module-level TTL cache so tests don't leak into each other."""
    search_service._SEARCH_CACHE.clear()
    yield
    search_service._SEARCH_CACHE.clear()


@pytest.fixture
def fake_db():
    return MagicMock()


@pytest.fixture
def stub_execute_search():
    """Replace execute_search with a no-op returning []."""
    with patch.object(search_service, "execute_search", AsyncMock(return_value=[])) as m:
        yield m


async def test_rule_based_entity_query_skips_claude(fake_db, stub_execute_search):
    """A query the rule-based parser understands must not hit the paid Claude
    API — it extracts entity filters itself, so no escalation happens."""
    with patch(
        "app.services.claude_search_parser.parse_query_with_claude",
        AsyncMock(return_value={"borough": "BROOKLYN"}),
    ) as claude_parser:
        result = await search_service.search_buildings_ai(fake_db, "worst buildings in Brooklyn")

    claude_parser.assert_not_called()
    assert result["total"] == 0
    assert result["query"] == "worst buildings in Brooklyn"
    assert result["needs_fallback"] is False


async def test_escalates_to_claude_when_rule_based_finds_no_entity(fake_db, stub_execute_search):
    """When the rule-based parser extracts no entity filter, escalate to Claude
    and use its result."""
    with patch(
        "app.services.claude_search_parser.parse_query_with_claude",
        AsyncMock(return_value={"borough": "BROOKLYN"}),
    ) as claude_parser:
        result = await search_service.search_buildings_ai(fake_db, "a decent place to crash")

    claude_parser.assert_called_once()
    assert result["needs_fallback"] is False
    assert result["confidence"] > 0


async def test_claude_empty_dict_falls_back_to_rule_based(fake_db, stub_execute_search):
    """An empty {} from Claude is treated the same as None — falls back."""
    with (
        patch(
            "app.services.claude_search_parser.parse_query_with_claude",
            AsyncMock(return_value={}),
        ),
        patch.object(search_service, "parse_search_query", return_value={
            "sort": [{"column": "hs.composite_score", "order": "DESC"}],
            "confidence": 0.3,
            "needs_fallback": True,
        }) as rule_parser,
    ):
        await search_service.search_buildings_ai(fake_db, "vague")

    rule_parser.assert_called_once_with("vague")


async def test_extra_filters_override_parsed_filters(fake_db, stub_execute_search):
    """API-side overrides (borough, min_units, include_small_homes) win over
    whatever the parser produced. ("best buildings" is handled by the rule-based
    parser, so Claude isn't consulted; the patch just guards against a real
    call.)"""
    with patch(
        "app.services.claude_search_parser.parse_query_with_claude",
        AsyncMock(return_value={"borough": "BROOKLYN"}),
    ):
        await search_service.search_buildings_ai(
            fake_db,
            "best buildings",
            extra_filters={"borough": "QUEENS", "min_units": 10},
        )

    # execute_search is called with validated filters
    args, _kwargs = stub_execute_search.call_args
    filters_passed = args[1]
    assert filters_passed["borough"] == "QUEENS"  # override won
    assert filters_passed["min_units"] == 10


async def test_unparseable_query_short_circuits_sql(fake_db, stub_execute_search):
    """A query with no entity filters must not run the SQL — otherwise the
    no-WHERE-clause query returns top-100 buildings city-wide, which is
    misleading for nonsense input like 'asdfgh'."""
    with patch(
        "app.services.claude_search_parser.parse_query_with_claude",
        AsyncMock(return_value=None),
    ):
        result = await search_service.search_buildings_ai(fake_db, "asdfgh")

    stub_execute_search.assert_not_called()
    assert result["total"] == 0
    assert result["results"] == []
    assert result["needs_fallback"] is True
    assert "Could not understand" in result["clarification"]


async def test_claude_sort_only_response_is_treated_as_unparseable(
    fake_db, stub_execute_search
):
    """If Claude returns only a sort clause (no entity filters), the query
    should still short-circuit instead of dumping top-100 city-wide."""
    claude_filters = {"sort": [{"column": "hs.composite_score", "order": "DESC"}]}

    with patch(
        "app.services.claude_search_parser.parse_query_with_claude",
        AsyncMock(return_value=claude_filters),
    ):
        result = await search_service.search_buildings_ai(fake_db, "buildings please")

    stub_execute_search.assert_not_called()
    assert result["needs_fallback"] is True
    assert result["total"] == 0
