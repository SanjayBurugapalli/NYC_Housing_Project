"""Rankings search: a match keeps the rank it holds in the full ranking.

The landlord ranking itself is stubbed; these cover the search, ranks and the
default-weight cache in front of it.
"""

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.api import rankings
from app.core.database import get_db
from app.main import app


def _portfolio(key: str, name: str, avg_score: float) -> dict:
    return {
        "entity_key": key, "owner_name": name, "building_count": 3, "avg_score": avg_score,
        "total_violations": 10, "total_complaints": 5, "total_units": 30,
        "boroughs": ["BROOKLYN"], "worst_bbl": "3000010001",
    }


# Worst first, as _landlord_ranking returns it.
RANKING = [
    _portfolio("ACME", "ACME REALTY LLC", 30.0),
    _portfolio("BETA", "BETA HOLDINGS INC", 40.0),
    _portfolio("ACME TWO", "ACME TWO CORP", 50.0),
]


@pytest.fixture
async def client():
    app.dependency_overrides[get_db] = lambda: None
    rankings._landlord_cache.clear()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.pop(get_db, None)
    rankings._landlord_cache.clear()


@pytest.fixture
def ranking():
    with patch.object(rankings, "_landlord_ranking", AsyncMock(return_value=RANKING)) as stub:
        yield stub


async def test_landlord_search_keeps_each_portfolios_rank(client, ranking):
    # Searched the way portfolios are grouped: "Acme Realty LLC" is "ACME".
    body = (await client.get("/api/rankings/landlords", params={"q": "Acme Realty LLC"})).json()
    assert [(l["owner_name"], l["rank"]) for l in body["landlords"]] == [("ACME REALTY LLC", 1), ("ACME TWO CORP", 3)]
    assert body["query"] == "Acme Realty LLC" and body["ranked_total"] == 3 and body["total"] == 2


async def test_landlord_search_of_only_suffixes_matches_nothing(client, ranking):
    body = (await client.get("/api/rankings/landlords", params={"q": "LLC"})).json()
    assert body["landlords"] == [] and body["ranked_total"] == 3


async def test_landlord_list_ranks_in_order(client, ranking):
    body = (await client.get("/api/rankings/landlords")).json()
    assert [l["rank"] for l in body["landlords"]] == [1, 2, 3] and body["query"] is None


async def test_default_ranking_is_cached_and_custom_weights_are_not(client, ranking):
    await client.get("/api/rankings/landlords")
    await client.get("/api/rankings/landlords", params={"q": "beta"})
    assert ranking.await_count == 1
    for _ in range(2):
        await client.get("/api/rankings/landlords", params={"w_pest": 0.5})
    assert ranking.await_count == 3


async def test_search_needs_two_characters(client, ranking):
    assert (await client.get("/api/rankings/landlords", params={"q": "a"})).status_code == 422
