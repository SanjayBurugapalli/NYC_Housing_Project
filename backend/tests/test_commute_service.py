"""Tests for the Transitous commute service: parsing, itinerary choice, fallbacks.

The fixture is a trimmed real /api/v6/plan response; HTTP is stubbed with
httpx.MockTransport so nothing leaves the machine.
"""

import json
from datetime import datetime
from pathlib import Path

import httpx
import pytest

from app.services import commute_service
from app.services.commute_service import (
    NYC_TZ,
    build_commute,
    build_leg,
    choose_itinerary,
    decode_polyline,
    get_commute,
    next_weekday_departure,
)

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "transitous_plan.json").read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def clear_cache():
    commute_service._CACHE.clear()
    yield
    commute_service._CACHE.clear()


def _encode(points: list[tuple[float, float]], precision: int) -> str:
    """Reference Google polyline encoder ((lat, lng) pairs) for round-trip tests."""
    out, prev_lat, prev_lng = [], 0, 0
    factor = 10 ** precision
    for lat, lng in points:
        ilat, ilng = round(lat * factor), round(lng * factor)
        for delta in (ilat - prev_lat, ilng - prev_lng):
            v = ~(delta << 1) if delta < 0 else delta << 1
            while v >= 0x20:
                out.append(chr((0x20 | (v & 0x1F)) + 63))
                v >>= 5
            out.append(chr(v + 63))
        prev_lat, prev_lng = ilat, ilng
    return "".join(out)


def test_decode_polyline_google_reference_precision_5():
    assert decode_polyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", precision=5) == [
        [-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252],
    ]


def test_decode_polyline_precision_6_round_trip():
    points = [(40.706608, -73.92291), (40.711926, -73.940202), (40.734793, -73.990735)]
    decoded = decode_polyline(_encode(points, 6))
    assert decoded == [[lng, lat] for lat, lng in points]
    assert decode_polyline("") == []


def test_build_commute_from_real_response():
    commute = build_commute(FIXTURE["itineraries"][0])
    assert commute["duration_min"] == 20
    assert commute["assumption"] == "Weekday, leaving 8:30 AM"
    assert commute["depart_at"].endswith("-05:00")  # reported in New York time
    assert commute["attribution"]["url"] == "https://transitous.org/sources"

    walk, subway, walk_out = commute["legs"]
    assert walk["mode"] == "WALK" and walk["from_name"] is None  # MOTIS "START"
    assert walk["to_name"] == "Jefferson St" and walk["num_stops"] is None
    assert subway["mode"] == "SUBWAY"
    assert subway["route_short_name"] == "L"
    assert subway["route_color"] == "#7c858c" and subway["route_text_color"] == "#ffffff"
    assert subway["headsign"] == "8 Av"
    assert subway["num_stops"] == 9  # 8 intermediate stops + 1
    assert subway["from_name"] == "Jefferson St" and subway["to_name"] == "14 St-Union Sq"
    assert len(subway["geometry"]) > 10
    lng, lat = subway["geometry"][0]
    assert -74.1 < lng < -73.7 and 40.5 < lat < 40.9  # [lng, lat] order
    assert walk_out["to_name"] is None  # MOTIS "END"


def test_build_leg_names_commuter_rail_by_its_railroad():
    lirr = {"mode": "REGIONAL_RAIL", "duration": 900, "routeShortName": "", "agencyName": "Long Island Rail Road",
            "routeLongName": "Ronkonkoma Branch", "routeColor": "a626aa"}
    leg = build_leg(lirr)
    assert (leg["mode"], leg["route_short_name"], leg["route_color"]) == ("RAIL", "LIRR", "#a626aa")
    bus = build_leg({"mode": "BUS", "duration": 600, "routeShortName": "Q75", "agencyName": "MTA New York City Transit"})
    assert (bus["mode"], bus["route_short_name"]) == ("BUS", "Q75")


def _itin(duration: int, modes: list[str], start: str = "2026-11-12T13:30:00Z") -> dict:
    return {"duration": duration, "startTime": start, "endTime": start, "transfers": 0,
            "legs": [{"mode": m, "duration": 60} for m in modes]}


def test_choose_itinerary_fastest_wins_whatever_the_mode():
    requested = datetime(2026, 11, 12, 8, 30, tzinfo=NYC_TZ)
    bus = _itin(1200, ["WALK", "BUS", "WALK", "SUBWAY", "WALK"])
    bus["legs"][1]["duration"] = 600  # a real ride, not a one-stop hop
    rail = _itin(1500, ["WALK", "REGIONAL_RAIL", "WALK", "SUBWAY", "WALK"])
    slow_subway = _itin(2400, ["WALK", "SUBWAY", "WALK"])
    fast_subway = _itin(1800, ["WALK", "SUBWAY", "WALK", "SUBWAY", "WALK"])
    assert choose_itinerary([bus, rail, slow_subway, fast_subway], requested) is bus
    assert choose_itinerary([rail, slow_subway, fast_subway], requested) is rail
    assert choose_itinerary([], requested) is None


def test_choose_itinerary_subway_breaks_an_exact_tie():
    requested = datetime(2026, 11, 12, 8, 30, tzinfo=NYC_TZ)
    bus = _itin(1800, ["WALK", "BUS", "WALK"])
    subway = _itin(1800, ["WALK", "SUBWAY", "WALK"])
    assert choose_itinerary([bus, subway], requested) is subway


def test_choose_itinerary_skips_a_one_stop_bus_hop_that_barely_helps():
    requested = datetime(2026, 11, 12, 8, 30, tzinfo=NYC_TZ)

    def with_bus(duration: int, bus_seconds: int) -> dict:
        it = _itin(duration, ["WALK", "BUS", "WALK", "SUBWAY", "WALK"])
        it["legs"][1]["duration"] = bus_seconds
        return it

    hop = with_bus(35 * 60, 60)        # 1-minute bus ride, 35 min overall
    ride = with_bus(36 * 60, 4 * 60)   # 4-minute bus ride, 36 min overall
    assert choose_itinerary([hop, ride], requested) is ride
    # ...but a hop that saves real time still wins.
    much_faster_hop = with_bus(28 * 60, 60)
    assert choose_itinerary([much_faster_hop, ride], requested) is much_faster_hop


def test_choose_itinerary_ignores_much_later_departures():
    requested = datetime(2026, 11, 12, 8, 30, tzinfo=NYC_TZ)
    on_time = _itin(2000, ["WALK", "SUBWAY", "WALK"], start="2026-11-12T13:35:00Z")
    late_but_fast = _itin(1000, ["WALK", "SUBWAY", "WALK"], start="2026-11-12T15:00:00Z")
    assert choose_itinerary([on_time, late_but_fast], requested) is on_time


@pytest.mark.parametrize(
    "now, expected",
    [
        (datetime(2026, 11, 10, 7, 0, tzinfo=NYC_TZ), datetime(2026, 11, 10, 8, 30, tzinfo=NYC_TZ)),  # Tue before
        (datetime(2026, 11, 10, 9, 0, tzinfo=NYC_TZ), datetime(2026, 11, 11, 8, 30, tzinfo=NYC_TZ)),  # Tue after
        (datetime(2026, 11, 13, 9, 0, tzinfo=NYC_TZ), datetime(2026, 11, 16, 8, 30, tzinfo=NYC_TZ)),  # Fri → Mon
        (datetime(2026, 11, 14, 7, 0, tzinfo=NYC_TZ), datetime(2026, 11, 16, 8, 30, tzinfo=NYC_TZ)),  # Sat → Mon
    ],
)
def test_next_weekday_departure(now, expected):
    assert next_weekday_departure(now) == expected


def _client(responses: list[dict], calls: list[dict]) -> httpx.AsyncClient:
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(dict(request.url.params))
        return httpx.Response(200, json=responses[len(calls) - 1])
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_get_commute_all_transit_and_cached():
    calls: list[dict] = []
    async with _client([FIXTURE], calls) as client:
        first = await get_commute(40.7066, -73.9229, 40.7359, -73.9911, client=client)
        again = await get_commute(40.70661, -73.92291, 40.73591, -73.99111, client=client)
    assert first["duration_min"] == 20
    assert again is first  # same 4-dp cache key → no second upstream call
    assert len(calls) == 1
    assert calls[0]["transitModes"] == "TRANSIT"


async def test_get_commute_prefers_walking_when_faster():
    calls: list[dict] = []
    walk = {"duration": 300, "startTime": "2026-11-12T13:30:00Z", "endTime": "2026-11-12T13:35:00Z",
            "legs": [{"mode": "WALK", "duration": 300, "from": {"name": "START"}, "to": {"name": "END"}}]}
    async with _client([{"itineraries": FIXTURE["itineraries"], "direct": [walk]}], calls) as client:
        result = await get_commute(40.7066, -73.9229, 40.7070, -73.9235, client=client)
    assert result["duration_min"] == 5
    assert [leg["mode"] for leg in result["legs"]] == ["WALK"]


async def test_get_commute_no_route_returns_none():
    calls: list[dict] = []
    empty = {"itineraries": [], "direct": []}
    async with _client([empty], calls) as client:
        assert await get_commute(40.5, -74.2, 40.9, -73.7, client=client) is None
    assert len(calls) == 1  # no second, wider request — the first already allowed every mode


async def test_get_commute_upstream_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(commute_service.CommuteUpstreamError):
            await get_commute(40.7, -73.9, 40.75, -73.98, client=client)
