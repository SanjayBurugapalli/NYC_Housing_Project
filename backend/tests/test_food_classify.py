"""Unit tests for the food_places classification + estimated price tiers."""

import sys
from pathlib import Path

import pytest

# data/ingest is a flat script directory (its modules import each other as
# `from base import ...`), so put it on sys.path. backend/tests is either
# <repo>/backend/tests (local) or /app/tests with data mounted at /app/data.
_here = Path(__file__).resolve()
for _candidate in (_here.parents[2] / "data" / "ingest", _here.parents[1] / "data" / "ingest"):
    if _candidate.is_dir() and str(_candidate) not in sys.path:
        sys.path.insert(0, str(_candidate))

from food_classify import (  # noqa: E402
    classify_store,
    clean_cuisine,
    is_non_public_kitchen,
    never_inspected,
    normalize_name,
    restaurant_price_tier,
    title_name,
)


def test_normalize_name():
    assert normalize_name("C-TOWN SUPERMARKET") == "C TOWN SUPERMARKET"
    assert normalize_name("Trader Joe's #540") == "TRADER JOES 540"
    assert normalize_name("D'AGOSTINO") == "DAGOSTINO"
    assert normalize_name(None) == ""


@pytest.mark.parametrize(
    "name, sqft, expected",
    [
        # chains, priced by the chain table
        ("KEY FOOD", "12000", ("grocery", "Supermarket", 1)),
        ("C-TOWN", None, ("grocery", "Supermarket", 1)),
        ("TRADER JOE'S #540", "9000", ("grocery", "Supermarket", 2)),
        ("WHOLE FOODS MARKET", "40000", ("grocery", "Supermarket", 3)),
        ("D'AGOSTINO SUPERMARKETS #815", None, ("grocery", "Supermarket", 3)),
        # independents: big store or "supermarket" in the name
        ("LA ESPERANZA SUPERMARKET", "3000", ("grocery", "Supermarket", 1)),
        ("SUNSET MART", "6500", ("grocery", "Supermarket", 1)),
        # specialty markets
        ("GREEN VALLEY PRODUCE", None, ("grocery", "Produce market", 1)),
        ("TONY'S MEAT MARKET", None, ("grocery", "Butcher", 1)),
        # bodegas
        ("JILI MINI MARKET", "1000", ("deli", "Corner store", 1)),
        ("GOURMET AVE X DELI & GRILL", "2500", ("deli", "Deli", 1)),
        ("SAM'S DELI & GROCERY", "1200", ("deli", "Deli", 1)),
    ],
)
def test_classify_store(name, sqft, expected):
    assert classify_store(name, sqft) == expected


@pytest.mark.parametrize(
    "name",
    [
        "CVS PHARMACY", "DUANE READE", "BP", "MOBIL MART", "DOLLAR DEALS",
        "JO MART CHOCOLATES", "EDIBLE ARRANGEMENTS", "SUSHILUX@FAIRWAY MKT",
        "FRESH & TASTY SUSHI", "", None,
    ],
)
def test_classify_store_skips_non_food_retail(name):
    assert classify_store(name, "2000") is None


def test_whole_word_exclusions_dont_catch_substrings():
    # "BP" / "GAS" only as whole words.
    assert classify_store("BPK DELI", "800") == ("deli", "Deli", 1)
    assert classify_store("GASTRO MARKET", "800") == ("deli", "Corner store", 1)


@pytest.mark.parametrize(
    "name, cuisine, tier",
    [
        ("MCDONALD'S", "Hamburgers", 1),
        ("POPEYES LOUISIANA KITCHEN", None, 1),       # chain, even without a cuisine
        ("JOE'S PIZZA", "Pizza", 1),
        ("GOLDEN DRAGON", "Chinese", 1),
        ("LUCALI", "Italian", 2),
        ("SUSHI NAKAZAWA", "Japanese", 2),
        ("PETER LUGER", "Steakhouse", 3),
        ("LE BERNARDIN", "French", 3),
        ("SOME NEW PLACE", None, None),               # not yet inspected
        ("PLACE", "Not Listed/Not Applicable", None),
        ("PLACE", "Other", 2),
    ],
)
def test_restaurant_price_tier(name, cuisine, tier):
    assert restaurant_price_tier(name, cuisine) == tier


def test_clean_cuisine():
    assert clean_cuisine("Coffee/Tea") == "Coffee & tea"
    assert clean_cuisine("Juice, Smoothies, Fruit Salads") == "Juice & smoothies"
    assert clean_cuisine("Thai") == "Thai"
    assert clean_cuisine("Not Listed/Not Applicable") is None
    assert clean_cuisine(None) is None


def test_title_name():
    assert title_name("JOE'S PIZZA & DELI") == "Joe's Pizza & Deli"
    assert title_name("  KEY   FOOD ") == "Key Food"
    assert title_name("BBQ KING") == "BBQ King"


@pytest.mark.parametrize(
    "name",
    [
        "TIFFANY AND CO. (EMPLOYEE CAFETERIA)",
        "GOLDMAN SACHS STAFF DINING",
        "FOUR SEASONS HOTEL BANQUET KITCHEN",
        "CORBET & CONLEY CATERERS",
        "MARYMOUNT MANHATTAN COLLEGE CAFETERIA",
        "ST JOHN'S UNIVERSITY FACULTY DINING ROOM",
        "XAVIER HIGH SCHOOL",
        "P.S. 41 CAFETERIA",
        "MOUNT SINAI HOSPITAL CAFE",
    ],
)
def test_non_public_kitchens_are_flagged(name):
    assert is_non_public_kitchen(name)


@pytest.mark.parametrize(
    "name",
    [
        "K'S CAFETERIA",
        "THE COMMISSARY AT METROGRAPH",
        "JOE'S PIZZA",
        "STAFFORD'S",
        "EMPLOYEES ONLY",
        "MABLE'S SMOKEHOUSE & BANQUET HALL",
        "FLAM'S CUISINE & CATERING",
    ],
)
def test_public_places_are_kept(name):
    assert not is_non_public_kitchen(name)


def test_never_inspected():
    assert never_inspected("1900-01-01T00:00:00.000")
    assert never_inspected(None)
    assert not never_inspected("2026-08-14T00:00:00.000")
