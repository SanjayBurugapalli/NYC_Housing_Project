"""Tests for the rent-stabilized filter, letter-grade parsing, filter chips,
bbox validation, and the structured-filters ("remove a chip") search path."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import search_service
from app.services.claude_search_parser import SEARCH_TOOL, _normalize_claude_filters
from app.services.search_service import (
    clamp_bbox,
    filter_chips,
    parse_search_query,
    search_with_filters,
    validate_filters,
)


# --- rent stabilized -------------------------------------------------------


@pytest.mark.parametrize(
    "query",
    ["rent stabilized in Bushwick", "Rent-stabilized, no heat complaints", "stabilized apartments", "rent regulated buildings"],
)
def test_rent_stabilized_keywords(query):
    filters = parse_search_query(query)
    assert filters["rent_stabilized"] is True
    assert filters["needs_fallback"] is False  # counts as an entity filter on its own


def test_rent_stabilized_negated():
    assert parse_search_query("not rent stabilized in Queens")["rent_stabilized"] is False


def test_regulated_alone_is_not_rent_stabilized():
    assert "rent_stabilized" not in parse_search_query("regulated buildings in Queens")


def test_no_heat_complaints_still_excluded_alongside_rent_stabilized():
    filters = parse_search_query("Rent-stabilized, no heat complaints")
    assert filters["exclude_complaint_types"] == ["heat"]


def test_claude_schema_and_passthrough_include_rent_stabilized():
    assert SEARCH_TOOL["input_schema"]["properties"]["rent_stabilized"]["type"] == "boolean"
    assert _normalize_claude_filters({"rent_stabilized": True}) == {"rent_stabilized": True}


# --- letter grades -----------------------------------------------------------


@pytest.mark.parametrize(
    "query, lo, hi",
    [
        ("Graded A in Astoria", 97, None),
        ("grade a buildings", 97, None),
        ("a-rated buildings in Harlem", 97, None),
        ("grade b buildings in Brooklyn", 90, 96.99),
        ("c grade buildings", 75, 89.99),
        ("grade f buildings in the Bronx", None, 54.99),
    ],
)
def test_letter_grade_bands(query, lo, hi):
    filters = parse_search_query(query)
    assert filters.get("min_score") == lo
    assert filters.get("max_score") == hi


def test_best_and_worst_keep_their_old_bands():
    assert parse_search_query("best buildings in Brooklyn")["min_score"] == 80
    assert parse_search_query("worst buildings in Bushwick")["max_score"] == 50


# --- validation --------------------------------------------------------------


def test_clamp_bbox():
    assert clamp_bbox([-73.93, 40.69, -73.90, 40.71]) == [-73.93, 40.69, -73.90, 40.71]
    assert clamp_bbox([-80, 30, -70, 50]) == [-74.3, 40.45, -73.65, 40.95]  # clamped to NYC
    assert clamp_bbox([-73.9, 40.7, -73.95, 40.75]) is None  # west >= east
    assert clamp_bbox([1, 2, 3]) is None
    assert clamp_bbox(["a", "b", "c", "d"]) is None
    assert clamp_bbox(None) is None


def test_validate_filters_new_keys():
    out = validate_filters({
        "rent_stabilized": True,
        "bbox": [-73.93, 40.69, -73.90, 40.71],
        "min_score": "DROP TABLE",
        "evil": 1,
    })
    assert out == {"rent_stabilized": True, "bbox": [-73.93, 40.69, -73.90, 40.71]}
    assert "rent_stabilized" not in validate_filters({"rent_stabilized": "yes"})


# --- chips -------------------------------------------------------------------


def test_filter_chips_one_per_key_with_human_labels():
    filters = {
        "nta_name": "Bushwick",
        "borough": "BROOKLYN",
        "rent_stabilized": True,
        "min_score": 97,
        "exclude_complaint_types": ["heat"],
        "min_units": 10,
        "max_year_built": 1939,
        "building_classes": ["D"],
        "bbox": [-73.93, 40.69, -73.90, 40.71],
        "sort": [{"column": "hs.composite_score", "order": "DESC"}],
        "include_small_homes": False,
    }
    chips = filter_chips(filters)
    labels = {c["key"]: c["label"] for c in chips}
    assert labels == {
        "nta_name": "Bushwick",
        "borough": "Brooklyn",
        "bbox": "This map area",
        "rent_stabilized": "Rent stabilized",
        "min_score": "Grade A only",
        "exclude_complaint_types": "No heat complaints",
        "min_units": "10+ units",
        "max_year_built": "Built before 1940",
        "building_classes": "Elevator buildings",
    }
    # Every chip key is a real filter key, so removing one = dropping that key.
    assert all(c["key"] in filters for c in chips)


def test_filter_chip_labels_for_ranges_and_violations():
    labels = [c["label"] for c in filter_chips({
        "max_score": 50,
        "min_year_built": 1946,
        "complaint_types": ["hpd_c"],
        "has_litigation": True,
    })]
    assert labels == ["Health 50 or below", "Has Class C violations", "Has lawsuits", "Built 1946 or later"]


# --- structured override path ------------------------------------------------


@pytest.fixture
def stub_execute():
    with patch.object(search_service, "execute_search", AsyncMock(return_value=[{"bbl": "1"}])) as m:
        yield m


async def test_search_with_filters_executes_validated_filters(stub_execute):
    result = await search_with_filters(
        MagicMock(), "rent stabilized in bushwick", {"nta_name": "Bushwick", "rent_stabilized": True, "junk": 1}
    )
    executed = stub_execute.await_args.args[1]
    assert executed == {"nta_name": "Bushwick", "rent_stabilized": True}
    assert result["total"] == 1
    assert [c["key"] for c in result["filter_chips"]] == ["nta_name", "rent_stabilized"]
    assert result["filters"] == executed


async def test_search_with_filters_short_circuits_without_entity_filters(stub_execute):
    result = await search_with_filters(MagicMock(), "q", {"sort": [{"column": "hs.composite_score", "order": "DESC"}]})
    stub_execute.assert_not_awaited()
    assert result["results"] == [] and result["needs_fallback"] is True
    assert result["clarification"] == search_service.NO_FILTERS_MESSAGE


async def test_nl_search_returns_filters_and_chips(stub_execute):
    search_service._SEARCH_CACHE.clear()
    result = await search_service.search_buildings_ai(MagicMock(), "rent stabilized in Bushwick")
    assert result["filters"]["rent_stabilized"] is True
    assert {c["label"] for c in result["filter_chips"]} == {"Bushwick", "Rent stabilized"}
    assert "confidence" not in result["filters"]
    search_service._SEARCH_CACHE.clear()
