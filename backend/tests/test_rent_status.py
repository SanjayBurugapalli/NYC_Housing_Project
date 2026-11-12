"""Rent-status labels on the building card and the SQL twin search uses.

The co-op classes come from PLUTO's class list, checked against owner names in
the data: C6/D4/D0 owners are largely "... Owners Corp"/"Tenants Corp", while
C0 (three-family walk-ups) and D5 (converted elevator rentals) have none.
"""
import pytest

from app.services.building_service import COOP_CLASSES, RENT_STABILIZED_SQL, _compute_rent_status
from app.services.search_service import COOP_CLASSES as SEARCH_COOP_CLASSES


@pytest.mark.parametrize("bc, year, units, expected", [
    ("C6", 1925, 40, "coop"),        # walk-up cooperative
    ("C8", 1925, 8, "coop"),         # walk-up co-op, loft conversion
    ("D4", 1960, 120, "coop"),       # elevator cooperative
    ("D0", 1910, 12, "coop"),        # elevator co-op, loft conversion
    ("R4", 2008, 1, "condo"),        # condo unit in an elevator building
    ("C0", 1925, 3, "not_regulated"),       # three-family walk-up: a rental, not a co-op
    ("D5", 1930, 40, "likely_stabilized"),  # converted elevator rental, pre-1974, 6+ units
    ("C1", 1920, 12, "likely_stabilized"),
    ("C1", 1990, 12, "not_regulated"),      # built after 1974
    ("C2", 1920, 5, "not_regulated"),       # under 6 units
    ("A1", 1920, 1, "not_regulated"),
    ("", 1920, 10, "unknown"),
])
def test_rent_status(bc, year, units, expected):
    assert _compute_rent_status(bc, year, units) == expected


def test_stabilized_sql_excludes_exactly_the_coops():
    for code in COOP_CLASSES:
        assert f"'{code}'" in RENT_STABILIZED_SQL
    for code in ("C0", "D5", "C1"):
        assert f"'{code}'" not in RENT_STABILIZED_SQL


def test_coop_search_matches_the_card_label():
    # "co-ops" in search finds every class the card calls a co-op, plus R9 (a co-op inside a condo).
    assert set(SEARCH_COOP_CLASSES) == set(COOP_CLASSES) | {"R9"}
