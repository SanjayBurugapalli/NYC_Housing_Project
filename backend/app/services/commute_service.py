"""Transit + walking commute times via Transitous (MOTIS).

Transitous (https://transitous.org) is a free, community-run transit router
that includes the MTA subway, bus, Staten Island Railway, LIRR/Metro-North and
NYC ferry GTFS. Every mode is allowed and the fastest trip wins — in much of
Queens, the Bronx and Staten Island a bus (or the SIR + ferry) is the commute. Its usage policy requires open-source,
non-commercial use, an identifying User-Agent, light traffic (>720 /plan
calls/day counts as heavy) and visible attribution — hence the 6-hour cache and
the attribution block in every response.

Google's Directions/Routes API is not an option here: its terms forbid showing
Routes content on a non-Google map, and the app renders with Mapbox.
"""

import logging
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

logger = logging.getLogger(__name__)

TRANSITOUS_PLAN_URL = "https://api.transitous.org/api/v6/plan"
USER_AGENT = "BeforeYouRent/1.0 (+https://github.com/SanjayBurugapalli/NYC_Housing_Project)"
REQUEST_TIMEOUT_SECONDS = 10.0

NYC_TZ = ZoneInfo("America/New_York")
DEPART_HOUR, DEPART_MINUTE = 8, 30
ASSUMPTION = "Weekday, leaving 8:30 AM"
ATTRIBUTION = {"text": "Transit routing by Transitous", "url": "https://transitous.org/sources"}

# Ignore itineraries that leave much later than the requested departure — MOTIS
# returns a window of options and a 9:30 trip isn't the 8:30 commute.
_MAX_DEPARTURE_SLACK = timedelta(minutes=45)

_CACHE: dict[tuple[float, float, float, float], tuple[dict, float]] = {}
_CACHE_TTL_SECONDS = 6 * 60 * 60
_CACHE_MAX_ENTRIES = 2000

_MODE_MAP = {
    "WALK": "WALK",
    "SUBWAY": "SUBWAY",
    "METRO": "SUBWAY",
    "BUS": "BUS",
    "COACH": "BUS",
    "FERRY": "FERRY",
}


class CommuteUpstreamError(Exception):
    """Transitous was unreachable or returned an error."""


def next_weekday_departure(now: datetime | None = None) -> datetime:
    """The next weekday 8:30 AM (New York time) that is still in the future."""
    now = (now or datetime.now(NYC_TZ)).astimezone(NYC_TZ)
    candidate = now.replace(hour=DEPART_HOUR, minute=DEPART_MINUTE, second=0, microsecond=0)
    if candidate <= now:
        candidate += timedelta(days=1)
    while candidate.weekday() >= 5:  # Sat/Sun
        candidate += timedelta(days=1)
    return candidate


def decode_polyline(encoded: str, precision: int = 6) -> list[list[float]]:
    """Decode a Google-style encoded polyline into [[lng, lat], ...].

    MOTIS encodes leg geometry at precision 6 (1e6), not the usual 5.
    """
    coords: list[list[float]] = []
    index = lat = lng = 0
    factor = 10 ** precision
    length = len(encoded)
    while index < length:
        deltas = []
        for _ in range(2):
            shift = result = 0
            while True:
                if index >= length:
                    return coords
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            deltas.append(~(result >> 1) if result & 1 else result >> 1)
        lat += deltas[0]
        lng += deltas[1]
        coords.append([round(lng / factor, 6), round(lat / factor, 6)])
    return coords


def _map_mode(mode: str) -> str:
    if mode in _MODE_MAP:
        return _MODE_MAP[mode]
    if "RAIL" in mode:
        return "RAIL"
    return "OTHER"


def _color(value: str | None) -> str | None:
    if not value:
        return None
    return value if value.startswith("#") else f"#{value}"


def _place_name(place: dict | None) -> str | None:
    name = (place or {}).get("name")
    # MOTIS labels the raw request coordinates START / END.
    return None if name in (None, "", "START", "END") else name


def _minutes(seconds: float | int | None, minimum: int = 0) -> int:
    return max(minimum, round((seconds or 0) / 60))


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _non_subway_legs(itinerary: dict) -> int:
    """Transit legs that aren't the subway — only used to break ties."""
    modes = [_map_mode(leg.get("mode", "")) for leg in itinerary.get("legs", [])]
    return sum(1 for m in modes if m not in ("WALK", "SUBWAY"))


# Riding a bus for a stop to shave a minute off a walk isn't how anyone
# commutes (and it bets on the bus showing up exactly on time), so a bus leg
# this short ranks as if it cost a few extra minutes. It only wins when it
# genuinely saves time.
_SHORT_BUS_HOP_SECONDS = 180
_SHORT_BUS_HOP_PENALTY_SECONDS = 360


def _ranking_cost(itinerary: dict) -> int:
    hops = sum(
        1
        for leg in itinerary.get("legs", [])
        if _map_mode(leg.get("mode", "")) == "BUS" and (leg.get("duration") or 0) < _SHORT_BUS_HOP_SECONDS
    )
    return itinerary.get("duration", 0) + hops * _SHORT_BUS_HOP_PENALTY_SECONDS


def choose_itinerary(itineraries: list[dict], requested: datetime) -> dict | None:
    """Shortest trip (short bus hops penalized), then fewest transfers, then the most subway."""
    if not itineraries:
        return None
    latest = requested + _MAX_DEPARTURE_SLACK
    in_window = [
        it for it in itineraries
        if (start := _parse_time(it.get("startTime"))) is None or start <= latest
    ]
    candidates = in_window or itineraries
    return min(
        candidates,
        key=lambda it: (_ranking_cost(it), it.get("transfers", 0), _non_subway_legs(it)),
    )


# Commuter rail feeds leave routeShortName blank (LIRR names the branch in
# routeLongName instead), so fall back to the railroad's familiar initials.
_AGENCY_SHORT_NAMES = {
    "Long Island Rail Road": "LIRR",
    "Metro-North Railroad": "MNR",
    "MTA Metro-North Railroad": "MNR",
}


def _route_short_name(leg: dict) -> str | None:
    return leg.get("routeShortName") or _AGENCY_SHORT_NAMES.get(leg.get("agencyName") or "") or None


def build_leg(leg: dict) -> dict:
    mode = _map_mode(leg.get("mode", ""))
    transit = mode != "WALK"
    geometry = leg.get("legGeometry") or {}
    points = geometry.get("points") or ""
    return {
        "mode": mode,
        "duration_min": _minutes(leg.get("duration"), minimum=1),
        "from_name": _place_name(leg.get("from")),
        "to_name": _place_name(leg.get("to")),
        "route_short_name": _route_short_name(leg) if transit else None,
        "route_color": _color(leg.get("routeColor")) if transit else None,
        "route_text_color": _color(leg.get("routeTextColor")) if transit else None,
        "headsign": (leg.get("headsign") or None) if transit else None,
        "num_stops": len(leg.get("intermediateStops") or []) + 1 if transit else None,
        "geometry": decode_polyline(points, int(geometry.get("precision") or 6)) if points else [],
    }


def build_commute(itinerary: dict) -> dict:
    start = _parse_time(itinerary.get("startTime"))
    end = _parse_time(itinerary.get("endTime"))
    return {
        "duration_min": _minutes(itinerary.get("duration"), minimum=1),
        "depart_at": start.astimezone(NYC_TZ).isoformat() if start else "",
        "arrive_at": end.astimezone(NYC_TZ).isoformat() if end else "",
        "assumption": ASSUMPTION,
        "legs": [build_leg(leg) for leg in itinerary.get("legs", [])],
        "attribution": ATTRIBUTION,
    }


async def _plan(client: httpx.AsyncClient, params: dict) -> dict:
    try:
        resp = await client.get(TRANSITOUS_PLAN_URL, params=params)
        resp.raise_for_status()
        return resp.json()
    except (httpx.HTTPError, ValueError) as e:
        logger.warning("Transitous plan failed: %s", e)
        raise CommuteUpstreamError(str(e)) from e


def _cache_key(from_lat: float, from_lng: float, to_lat: float, to_lng: float) -> tuple:
    return (round(from_lat, 4), round(from_lng, 4), round(to_lat, 4), round(to_lng, 4))


def _cache_set(key: tuple, value: dict) -> None:
    if len(_CACHE) >= _CACHE_MAX_ENTRIES:
        # Evict oldest entries (by insertion order) until under cap
        for k in list(_CACHE.keys())[: len(_CACHE) - _CACHE_MAX_ENTRIES + 1]:
            _CACHE.pop(k, None)
    _CACHE[key] = (value, time.monotonic())


async def get_commute(
    from_lat: float, from_lng: float, to_lat: float, to_lng: float,
    client: httpx.AsyncClient | None = None,
) -> dict | None:
    """Plan the weekday-morning transit + walking trip. None when there's no route.

    One request across every transit mode; the fastest itinerary wins. Very
    short trips come back as a walk-only "direct" connection, which wins when
    it's no slower.
    """
    key = _cache_key(from_lat, from_lng, to_lat, to_lng)
    cached, ts = _CACHE.get(key, (None, 0.0))
    if cached is not None and (time.monotonic() - ts) < _CACHE_TTL_SECONDS:
        return cached

    depart = next_weekday_departure()
    params = {
        "fromPlace": f"{from_lat},{from_lng}",
        "toPlace": f"{to_lat},{to_lng}",
        "time": depart.isoformat(),
        "transitModes": "TRANSIT",
    }

    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT_SECONDS, headers={"User-Agent": USER_AGENT}
        )
    try:
        data = await _plan(client, params)
        chosen = choose_itinerary(data.get("itineraries") or [], depart)
        direct = data.get("direct") or []
        if direct:
            # Walking the whole way beats a subway trip that isn't faster.
            walk = min(direct, key=lambda it: it.get("duration", 0))
            if chosen is None or walk.get("duration", 0) <= chosen.get("duration", 0):
                chosen = walk
    finally:
        if owns_client:
            await client.aclose()

    if chosen is None:
        return None
    result = build_commute(chosen)
    _cache_set(key, result)
    return result
