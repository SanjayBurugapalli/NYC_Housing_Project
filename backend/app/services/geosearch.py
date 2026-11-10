"""NYC Planning Labs GeoSearch client (address → BBL / BIN / coordinates).

GeoSearch (https://geosearch.planninglabs.nyc) is the city's free, keyless
Pelias geocoder built on PAD. The listing-link resolver uses it to turn an
address parsed out of a StreetEasy/Zillow URL into a BBL; the frontend calls its
/autocomplete endpoint directly for the workplace input.
"""

import logging
import re
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

GEOSEARCH_URL = "https://geosearch.planninglabs.nyc/v2/search"
GEOSEARCH_TIMEOUT_SECONDS = 6.0

# GeoSearch reports boroughs title-cased ("Staten Island"); the DB stores them
# upper-cased ("STATEN ISLAND").
_BOROUGHS = {"MANHATTAN", "BRONX", "BROOKLYN", "QUEENS", "STATEN ISLAND"}


@dataclass(frozen=True)
class GeoMatch:
    label: str
    housenumber: str | None
    street: str | None
    borough: str | None
    bbl: str | None
    bin: str | None
    latitude: float
    longitude: float


def normalize_house_number(value: str | None) -> str:
    """Comparable form of a house number: "21-15" → "2115", "1A" → "1a"."""
    return re.sub(r"[^0-9a-z]", "", (value or "").lower())


async def geosearch(text: str, client: httpx.AsyncClient | None = None) -> GeoMatch | None:
    """Return GeoSearch's top match for ``text``, or None on no match / failure."""
    params = {"text": text, "size": "1"}
    try:
        if client is None:
            async with httpx.AsyncClient(timeout=GEOSEARCH_TIMEOUT_SECONDS) as c:
                resp = await c.get(GEOSEARCH_URL, params=params)
        else:
            resp = await client.get(GEOSEARCH_URL, params=params)
        resp.raise_for_status()
        data = resp.json()
    except (httpx.HTTPError, ValueError) as e:
        logger.warning("GeoSearch failed for %r: %s", text, e)
        return None

    features = data.get("features") or []
    if not features:
        return None
    return parse_feature(features[0])


def parse_feature(feature: dict) -> GeoMatch | None:
    """Map a GeoSearch GeoJSON feature to a GeoMatch (None if it has no point)."""
    props = feature.get("properties") or {}
    coords = (feature.get("geometry") or {}).get("coordinates") or []
    if len(coords) < 2:
        return None
    pad = (props.get("addendum") or {}).get("pad") or {}
    borough = (props.get("borough") or "").upper() or None
    return GeoMatch(
        label=props.get("label") or "",
        housenumber=props.get("housenumber"),
        street=props.get("street"),
        borough=borough if borough in _BOROUGHS else None,
        bbl=pad.get("bbl"),
        bin=pad.get("bin"),
        latitude=float(coords[1]),
        longitude=float(coords[0]),
    )
