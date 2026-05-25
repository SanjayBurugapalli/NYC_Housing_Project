"""Unit tests for the rule-based search parser in app.services.search_service.

These tests exercise the deterministic fallback path (no Claude API call), the
filter validator, and the address-normalization helpers. They do not require a
running database — `execute_search` is not invoked.

Run with: cd backend && pytest tests/test_search_parser.py -v
"""

import pytest

from app.services.search_service import (
    MAX_RESULTS,
    build_sort,
    compute_confidence,
    detect_global_intent,
    match_concepts,
    normalize,
    parse_search_query,
    validate_filters,
)
from app.api.search import (
    BBL_PATTERN,
    _address_variants,
    looks_like_address,
)


# ---------------------------------------------------------------------------
# normalize()
# ---------------------------------------------------------------------------


class TestNormalize:
    def test_lowercases(self):
        assert normalize("Brooklyn HEIGHTS") == "brooklyn heights"

    def test_collapses_whitespace(self):
        assert normalize("  worst   buildings  ") == "worst buildings"

    def test_strips_punctuation_but_keeps_hyphens(self):
        assert normalize("rat-free, walk-up!") == "rat-free walk-up"

    def test_keeps_apostrophes(self):
        assert normalize("hell's kitchen") == "hell's kitchen"

    def test_empty_string(self):
        assert normalize("") == ""


# ---------------------------------------------------------------------------
# match_concepts() / detect_global_intent() / build_sort()
# ---------------------------------------------------------------------------


class TestMatchConcepts:
    def test_noise_match(self):
        clauses = match_concepts(normalize("noisy buildings"))
        assert clauses == [{"column": "hs.noise_score", "order": "ASC"}]

    def test_quiet_match_inverts_direction(self):
        clauses = match_concepts(normalize("quiet buildings"))
        assert clauses == [{"column": "hs.noise_score", "order": "DESC"}]

    def test_pest_match(self):
        clauses = match_concepts(normalize("buildings with rats"))
        cols = [c["column"] for c in clauses]
        assert "hs.pest_rodent_score" in cols

    def test_no_match_returns_empty(self):
        assert match_concepts(normalize("places to live")) == []

    def test_negation_flips_direction(self):
        # "without rats" → want HIGH pest_rodent_score
        clauses = match_concepts(normalize("buildings without rats"))
        for c in clauses:
            if c["column"] == "hs.pest_rodent_score":
                assert c["order"] == "DESC"

    def test_each_column_appears_at_most_once(self):
        # "rats and roaches" both map to pest_rodent_score
        clauses = match_concepts(normalize("buildings with rats and roaches"))
        cols = [c["column"] for c in clauses]
        assert cols.count("hs.pest_rodent_score") == 1

    def test_phrase_override_rat_free(self):
        clauses = match_concepts(normalize("rat free buildings"))
        assert any(
            c["column"] == "hs.pest_rodent_score" and c["order"] == "DESC"
            for c in clauses
        )


class TestDetectGlobalIntent:
    def test_best(self):
        assert detect_global_intent(normalize("best buildings")) == "best"

    def test_worst(self):
        assert detect_global_intent(normalize("worst buildings in queens")) == "worst"

    def test_none(self):
        assert detect_global_intent(normalize("buildings in brooklyn")) is None

    def test_word_boundary_avoids_substring_false_positive(self):
        # "goodyear" must NOT trigger "good"
        assert detect_global_intent(normalize("goodyear building")) is None


class TestBuildSort:
    def test_default_no_concepts_no_intent(self):
        result = build_sort([], None)
        assert result == [{"column": "hs.composite_score", "order": "DESC"}]

    def test_no_concepts_worst_intent(self):
        result = build_sort([], "worst")
        assert result == [{"column": "hs.composite_score", "order": "ASC"}]

    def test_global_intent_overrides_concept_directions(self):
        concepts = [{"column": "hs.noise_score", "order": "ASC"}]
        result = build_sort(concepts, "best")
        assert result == [{"column": "hs.noise_score", "order": "DESC"}]

    def test_concepts_passthrough_without_intent(self):
        concepts = [
            {"column": "hs.noise_score", "order": "ASC"},
            {"column": "hs.pest_rodent_score", "order": "ASC"},
        ]
        assert build_sort(concepts, None) == concepts


# ---------------------------------------------------------------------------
# parse_search_query() — integration of all extractors
# ---------------------------------------------------------------------------


class TestParseSearchQuery:
    def test_borough_extraction(self):
        f = parse_search_query("buildings in brooklyn")
        assert f["borough"] == "BROOKLYN"

    def test_borough_alias_bk(self):
        f = parse_search_query("worst buildings bk")
        assert f["borough"] == "BROOKLYN"

    def test_neighborhood_extraction(self):
        f = parse_search_query("buildings in park slope")
        assert f["nta_name"] == "Park Slope"

    def test_nta_alias_uws(self):
        f = parse_search_query("uws buildings with rats")
        assert f["nta_name"] == "Upper West Side"

    def test_pest_complaint(self):
        f = parse_search_query("buildings with rats")
        assert "pest" in f.get("complaint_types", [])

    def test_negated_complaint_excluded(self):
        f = parse_search_query("buildings without rats in astoria")
        assert "pest" in f.get("exclude_complaint_types", [])
        assert "pest" not in f.get("complaint_types", [])

    def test_score_filter_bad(self):
        f = parse_search_query("worst buildings in queens")
        assert f.get("max_score") == 50

    def test_score_filter_good(self):
        f = parse_search_query("best buildings in manhattan")
        assert f.get("min_score") == 80

    def test_size_filter_min_units(self):
        f = parse_search_query("buildings with more than 50 units")
        assert f.get("min_units") == 50

    def test_size_filter_max_units(self):
        f = parse_search_query("buildings with less than 10 units")
        assert f.get("max_units") == 10

    def test_size_filter_at_least_n_units(self):
        f = parse_search_query("buildings with at least 100 units")
        assert f.get("min_units") == 100

    def test_year_pre_war(self):
        f = parse_search_query("pre-war buildings in manhattan")
        assert f.get("max_year_built") == 1945

    def test_year_post_war(self):
        f = parse_search_query("post-war buildings")
        assert f.get("min_year_built") == 1946

    def test_year_before(self):
        f = parse_search_query("buildings built before 1950")
        assert f.get("max_year_built") == 1950

    def test_year_decade(self):
        f = parse_search_query("buildings from the 1920s")
        assert f.get("min_year_built") == 1920
        assert f.get("max_year_built") == 1929

    def test_litigation_keyword(self):
        f = parse_search_query("buildings with lawsuits in brooklyn")
        assert f.get("has_litigation") is True

    def test_limit_top_n(self):
        f = parse_search_query("top 10 worst buildings")
        assert f.get("limit") == 10

    def test_limit_capped_at_max(self):
        f = parse_search_query("top 500 buildings")
        # Limit must not exceed MAX_RESULTS (filter only set if 1..MAX_RESULTS)
        if "limit" in f:
            assert f["limit"] <= MAX_RESULTS

    def test_building_class_walkup(self):
        f = parse_search_query("walk-up buildings in brooklyn")
        assert f.get("building_classes") == ["C"]

    def test_building_class_coop(self):
        f = parse_search_query("co-op buildings in manhattan")
        # Co-op maps to a specific list of class codes
        assert "C6" in f.get("building_classes", [])

    def test_owner_extraction(self):
        f = parse_search_query("buildings owned by Acme Corp in brooklyn")
        assert "acme corp" in (f.get("owner_name") or "").lower()

    def test_sort_default_descending_composite(self):
        f = parse_search_query("buildings in brooklyn")
        assert f["sort"] == [{"column": "hs.composite_score", "order": "DESC"}]

    def test_sort_noisy(self):
        f = parse_search_query("noisy buildings")
        assert f["sort"][0] == {"column": "hs.noise_score", "order": "ASC"}

    def test_needs_fallback_for_vague_query(self):
        f = parse_search_query("places to live")
        # No entity filters and low confidence
        assert f["needs_fallback"] is True

    def test_no_fallback_when_borough_known(self):
        f = parse_search_query("buildings in brooklyn")
        assert f["needs_fallback"] is False

    def test_confidence_in_range(self):
        f = parse_search_query("worst buildings with rats in brooklyn")
        assert 0.0 <= f["confidence"] <= 1.0


class TestComputeConfidence:
    def test_zero_for_empty(self):
        assert compute_confidence({}, [], None) == 0.0

    def test_borough_contributes(self):
        c = compute_confidence({"borough": "BROOKLYN"}, [], None)
        assert c == pytest.approx(0.4)

    def test_caps_at_one(self):
        c = compute_confidence(
            {"borough": "BROOKLYN", "nta_name": "X", "min_score": 50},
            [
                {"column": "hs.noise_score", "order": "ASC"},
                {"column": "hs.pest_rodent_score", "order": "ASC"},
            ],
            "best",
        )
        assert c == 1.0


# ---------------------------------------------------------------------------
# validate_filters() — security / sanitization
# ---------------------------------------------------------------------------


class TestValidateFilters:
    def test_drops_invalid_borough(self):
        validated = validate_filters({"borough": "TIMBUKTU"})
        assert "borough" not in validated

    def test_keeps_valid_borough(self):
        validated = validate_filters({"borough": "BROOKLYN"})
        assert validated["borough"] == "BROOKLYN"

    def test_clamps_min_score_above_100(self):
        validated = validate_filters({"min_score": 150})
        assert validated["min_score"] == 100

    def test_clamps_min_score_below_0(self):
        validated = validate_filters({"min_score": -10})
        assert validated["min_score"] == 0

    def test_clamps_max_units(self):
        validated = validate_filters({"max_units": 99999})
        assert validated["max_units"] == 10000

    def test_clamps_year_lower_bound(self):
        validated = validate_filters({"min_year_built": 1000})
        assert validated["min_year_built"] == 1800

    def test_drops_unknown_complaint_types(self):
        validated = validate_filters({"complaint_types": ["heat", "pizza", "noise"]})
        assert set(validated["complaint_types"]) == {"heat", "noise"}

    def test_rejects_invalid_building_class_format(self):
        validated = validate_filters({"building_classes": ["A", "junk!", "B9"]})
        assert validated["building_classes"] == ["A", "B9"]

    def test_sort_rejects_non_whitelisted_column(self):
        # Defense-in-depth — should never allow arbitrary ORDER BY targets
        validated = validate_filters({
            "sort": [{"column": "1; DROP TABLE buildings;", "order": "ASC"}]
        })
        # Whitelisted-only — falls back to composite_score DESC default
        assert validated["sort"] == [{"column": "hs.composite_score", "order": "DESC"}]

    def test_sort_rejects_bad_order(self):
        validated = validate_filters({
            "sort": [{"column": "hs.noise_score", "order": "RANDOM"}]
        })
        assert validated["sort"] == [{"column": "hs.composite_score", "order": "DESC"}]

    def test_sort_keeps_valid_clauses(self):
        validated = validate_filters({
            "sort": [{"column": "hs.noise_score", "order": "ASC"}]
        })
        assert validated["sort"] == [{"column": "hs.noise_score", "order": "ASC"}]

    def test_limit_clamped(self):
        validated = validate_filters({"limit": 5000})
        assert validated["limit"] == MAX_RESULTS

    def test_owner_name_truncated(self):
        validated = validate_filters({"owner_name": "x" * 500})
        assert len(validated["owner_name"]) == 100


# ---------------------------------------------------------------------------
# Address heuristic + variant generation (app.api.search)
# ---------------------------------------------------------------------------


class TestLooksLikeAddress:
    @pytest.mark.parametrize("q", [
        "350 West 42nd Street",
        "1500 Grand Concourse",
        "45-67 Broadway",
        "W 42nd St",
        "e 18 st",
    ])
    def test_positive(self, q):
        assert looks_like_address(q) is True

    @pytest.mark.parametrize("q", [
        "worst buildings in queens",
        "park slope",
        "noisy buildings",
        "buildings with rats",
    ])
    def test_negative(self, q):
        assert looks_like_address(q) is False


class TestAddressVariants:
    def test_uppercases_and_collapses(self):
        variants = _address_variants("  350 west  42nd  street  ")
        assert all(v == v.upper() for v in variants)
        assert all("  " not in v for v in variants)

    def test_contracts_direction_and_suffix(self):
        variants = _address_variants("350 WEST 42ND STREET")
        assert any("E " not in v and "W 42" in v for v in variants)  # contracted W
        assert any(v.endswith(" ST") or " ST " in v for v in variants)

    def test_strips_ordinal_suffix(self):
        variants = _address_variants("350 W 42ND ST")
        assert any("42 " in v or v.endswith(" 42") for v in variants) or any(
            "42 ST" in v for v in variants
        )

    def test_capped_at_5(self):
        variants = _address_variants("350 W 42ND ST")
        assert len(variants) <= 5


class TestBblPattern:
    def test_matches_10_digit(self):
        assert BBL_PATTERN.match("1000477501") is not None

    def test_rejects_non_numeric(self):
        assert BBL_PATTERN.match("100047750a") is None

    def test_rejects_wrong_length(self):
        assert BBL_PATTERN.match("12345") is None
        assert BBL_PATTERN.match("12345678901") is None
