"""Unit tests for owner/managing-agent name normalization (Tier 1 matching)."""

from app.services.entity_matching import normalize_entity_name, normalized_entity_sql


def test_strips_legal_suffix_variants_to_same_key():
    keys = {
        normalize_entity_name("ABC Realty LLC"),
        normalize_entity_name("ABC REALTY, L.L.C."),
        normalize_entity_name("ABC Realty Corp"),
        normalize_entity_name("ABC Realty Co."),
        normalize_entity_name("The ABC Realty Company"),
    }
    assert keys == {"ABC"}


def test_case_and_whitespace_insensitive():
    assert normalize_entity_name("  smith   holdings  ") == normalize_entity_name("SMITH HOLDINGS")
    assert normalize_entity_name("Smith Holdings") == "SMITH"


def test_ampersand_expands_to_and():
    assert normalize_entity_name("Smith & Jones LLC") == normalize_entity_name("Smith and Jones")
    assert normalize_entity_name("Smith & Jones LLC") == "SMITH AND JONES"


def test_leading_the_stripped_but_internal_kept():
    assert normalize_entity_name("The Related Companies") == "RELATED"
    # "THE" only stripped at the start
    assert normalize_entity_name("Park The Realty") == "PARK THE"


def test_distinct_owners_stay_distinct():
    assert normalize_entity_name("123 Main St LLC") != normalize_entity_name("125 Main St LLC")


def test_empty_and_stopword_only_names_return_none():
    assert normalize_entity_name(None) is None
    assert normalize_entity_name("") is None
    assert normalize_entity_name("   ") is None
    assert normalize_entity_name("LLC") is None
    assert normalize_entity_name("Management Co.") is None


def test_numbers_preserved():
    assert normalize_entity_name("550 Grand Street Realty LLC") == "550 GRAND STREET"


def test_sql_expression_includes_column_and_stopwords():
    sql = normalized_entity_sql("b.owner_name")
    assert "b.owner_name" in sql
    # alternation of stopwords is present for the word-boundary strip
    assert "LLC|" in sql
    assert "regexp_replace" in sql
