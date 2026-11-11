"""Parse a StreetEasy / Zillow listing URL into a street address.

We never fetch the listing page — both sites sit behind PerimeterX bot
protection and their terms forbid scraping — so the address is recovered from
the URL slug alone. Links that only carry a numeric ID (StreetEasy /rental/123)
or a building name (/building/the-eugene, Zillow /apartments/...) can't be
resolved and come back as ``no_address`` so the UI can ask for the address.

StreetEasy building slugs are the exact reverse of what
frontend/src/components/building/streetEasy.ts builds:
    /building/<house>-<street words>-<area>[/<unit>]
where <area> is new_york | brooklyn | bronx | staten_island, or a Queens
neighborhood slug (astoria, long_island_city). Queens hyphenated house numbers
are written with an underscore: 31_10-30-avenue-astoria → "31-10 30 Avenue".

Zillow puts the full address in the slug:
    /homedetails/<street>-<unit?>-<city>-NY-<zip>/<zpid>_zpid/
    /b/<street>-<city>-ny-<shortid>/
    /homes/<street>-<city>,-NY-<zip>_rb/
"""

import re
from dataclasses import dataclass
from typing import Literal
from urllib.parse import unquote, urlparse

ListingSource = Literal["streeteasy", "zillow"]
# ok          → an address was recovered
# no_address  → a real listing link, but the URL carries no address
# out_of_area → an address outside NYC (StreetEasy also lists New Jersey)
# invalid     → not a StreetEasy/Zillow listing link at all
ParseStatus = Literal["ok", "no_address", "out_of_area", "invalid"]


@dataclass(frozen=True)
class ParsedListing:
    status: ParseStatus
    source: ListingSource | None = None
    house_number: str | None = None
    street: str | None = None
    # Upper-cased DB borough name, only when the URL pins it down (StreetEasy
    # borough areas, Zillow zip/city). A Queens neighborhood slug leaves this
    # None and sets `locality` instead, since GeoSearch resolves the neighborhood.
    borough: str | None = None
    locality: str | None = None
    zip_code: str | None = None

    @property
    def street_address(self) -> str | None:
        if not self.house_number or not self.street:
            return None
        return f"{self.house_number} {self.street}"

    @property
    def display_address(self) -> str | None:
        """"602 Manhattan Avenue, Brooklyn" — shown back to the user."""
        addr = self.street_address
        if not addr:
            return None
        place = self.locality or (self.borough.title() if self.borough else None)
        return f"{addr}, {place}" if place else addr

    @property
    def geocode_text(self) -> str | None:
        """Free-text query for GeoSearch."""
        addr = self.street_address
        if not addr:
            return None
        parts = [addr]
        if self.locality:
            parts.append(self.locality)
        if self.borough:
            parts.append(self.borough.title())
        if self.zip_code:
            parts.append(f"NY {self.zip_code}")
        return ", ".join(parts)


_BOROUGH_AREAS = {
    "new_york": "MANHATTAN",
    "manhattan": "MANHATTAN",
    "brooklyn": "BROOKLYN",
    "bronx": "BRONX",
    "the_bronx": "BRONX",
    "staten_island": "STATEN ISLAND",
    "queens": "QUEENS",
}

# StreetEasy also covers the Hudson waterfront; those can never match a NYC BBL.
_NJ_AREAS = {
    "jersey_city", "hoboken", "weehawken", "west_new_york", "union_city",
    "north_bergen", "fort_lee", "edgewater", "guttenberg", "bayonne", "newark",
    "harrison", "cliffside_park", "secaucus",
}

# Zillow city names → borough. Queens addresses use the post-office locality.
_CITY_BOROUGHS = {
    "new york": "MANHATTAN",
    "manhattan": "MANHATTAN",
    "brooklyn": "BROOKLYN",
    "bronx": "BRONX",
    "the bronx": "BRONX",
    "staten island": "STATEN ISLAND",
}
_QUEENS_LOCALITIES = {
    "queens", "astoria", "long island city", "sunnyside", "woodside",
    "jackson heights", "elmhurst", "east elmhurst", "corona", "flushing",
    "forest hills", "rego park", "kew gardens", "richmond hill",
    "south richmond hill", "ozone park", "south ozone park", "howard beach",
    "jamaica", "hollis", "queens village", "bayside", "whitestone",
    "college point", "fresh meadows", "middle village", "maspeth", "ridgewood",
    "glendale", "woodhaven", "far rockaway", "rockaway park", "arverne",
    "little neck", "douglaston", "oakland gardens", "bellerose", "floral park",
    "glen oaks", "saint albans", "springfield gardens", "rosedale",
    "cambria heights", "laurelton", "briarwood",
}
for _loc in _QUEENS_LOCALITIES:
    _CITY_BOROUGHS[_loc] = "QUEENS"
_MAX_CITY_WORDS = max(len(c.split()) for c in _CITY_BOROUGHS)

_STREET_SUFFIXES = {
    "st", "street", "ave", "av", "avenue", "blvd", "boulevard", "rd", "road",
    "pl", "place", "dr", "drive", "ln", "lane", "ct", "court", "ter", "terrace",
    "pkwy", "parkway", "way", "sq", "square", "plz", "plaza", "hwy", "highway",
    "expy", "expressway", "broadway", "bowery", "loop", "walk", "row", "path",
    "cir", "circle", "tpke", "turnpike", "concourse", "slip", "oval", "crescent",
}

_UNIT_WORDS = {"apt", "unit", "ste", "suite", "ph", "fl", "floor", "rm", "room", "bsmt"}

_US_STATES_NOT_NY = {
    "nj", "ct", "pa", "ma", "ri", "vt", "nh", "me", "de", "md", "dc", "va", "fl",
    "ca", "tx", "il", "wa", "co", "ga", "nc", "sc", "oh", "mi", "az", "nv", "or",
}


def zip_to_borough(zip_code: str | None) -> str | None:
    """Borough for a NYC zip code, None for anything outside the five boroughs."""
    if not zip_code or not re.fullmatch(r"\d{5}", zip_code):
        return None
    n = int(zip_code)
    if 10001 <= n <= 10292:
        return "MANHATTAN"
    if 10301 <= n <= 10314:
        return "STATEN ISLAND"
    if 10451 <= n <= 10475:
        return "BRONX"
    if 11201 <= n <= 11256:
        return "BROOKLYN"
    if 11004 <= n <= 11005 or 11101 <= n <= 11109 or 11351 <= n <= 11436 or 11691 <= n <= 11697:
        return "QUEENS"
    return None


def _title(tokens: list[str]) -> str:
    return " ".join(t.capitalize() for t in tokens if t)


def _starts_with_digit(token: str) -> bool:
    return bool(token) and token[0].isdigit()


def parse_listing_url(raw_url: str) -> ParsedListing:
    url = (raw_url or "").strip()
    if not url:
        return ParsedListing(status="invalid")
    if not re.match(r"^[a-z][a-z0-9+.-]*://", url, re.IGNORECASE):
        url = "https://" + url

    try:
        parsed = urlparse(url)
    except ValueError:
        return ParsedListing(status="invalid")

    host = (parsed.hostname or "").lower()
    segments = [unquote(s) for s in parsed.path.split("/") if s]

    if host == "streeteasy.com" or host.endswith(".streeteasy.com"):
        return _parse_streeteasy(segments)
    if host == "zillow.com" or host.endswith(".zillow.com"):
        return _parse_zillow(segments)
    return ParsedListing(status="invalid")


# ---------------------------------------------------------------------------
# StreetEasy
# ---------------------------------------------------------------------------


def _parse_streeteasy(segments: list[str]) -> ParsedListing:
    if not segments:
        return ParsedListing(status="invalid", source="streeteasy")
    kind = segments[0].lower()
    if kind in ("rental", "sale"):
        return ParsedListing(status="no_address", source="streeteasy")
    if kind != "building" or len(segments) < 2:
        return ParsedListing(status="invalid", source="streeteasy")

    tokens = [t for t in segments[1].lower().split("-") if t]
    # Named buildings ("the-eugene") carry no house number.
    if len(tokens) < 2 or not _starts_with_digit(tokens[0]):
        return ParsedListing(status="no_address", source="streeteasy")

    house = tokens[0].replace("_", "-")
    area = tokens[-1]
    borough: str | None = None
    locality: str | None = None

    if area in _BOROUGH_AREAS:
        borough = _BOROUGH_AREAS[area]
        street_tokens = tokens[1:-1]
    elif area in _NJ_AREAS:
        return ParsedListing(status="out_of_area", source="streeteasy")
    elif area in _STREET_SUFFIXES:
        # No area suffix at all — leave the borough to GeoSearch.
        street_tokens = tokens[1:]
    else:
        # Queens building URLs are keyed by neighborhood, not borough.
        locality = _title(area.split("_"))
        street_tokens = tokens[1:-1]

    if not street_tokens:
        return ParsedListing(status="no_address", source="streeteasy")

    return ParsedListing(
        status="ok",
        source="streeteasy",
        house_number=house,
        street=_title([w for t in street_tokens for w in t.split("_")]),
        borough=borough,
        locality=locality,
    )


# ---------------------------------------------------------------------------
# Zillow
# ---------------------------------------------------------------------------


def _strip_units(tokens: list[str]) -> list[str]:
    """Drop "APT 5B" / "UNIT 3" / "#4A" style unit designators from a token list."""
    out: list[str] = []
    skip_next = False
    for i, tok in enumerate(tokens):
        if skip_next:
            skip_next = False
            continue
        low = tok.lower()
        if low.startswith("#"):
            continue
        if low in _UNIT_WORDS and i > 0:
            nxt = tokens[i + 1] if i + 1 < len(tokens) else ""
            # Only swallow the following token when it looks like a unit id
            # ("5B", "3", "A") — "PH" can stand alone before the city name.
            if nxt and (any(c.isdigit() for c in nxt) or len(nxt) <= 2):
                skip_next = True
            continue
        out.append(tok)
    return out


def _split_street_city(rest: list[str]) -> tuple[list[str], list[str]]:
    """Split the tokens after the house number into (street, city)."""
    lowered = [t.lower() for t in rest]
    # Longest known city name at the end of the slug wins.
    for n in range(min(_MAX_CITY_WORDS, len(rest) - 1), 0, -1):
        if " ".join(lowered[-n:]) in _CITY_BOROUGHS:
            return rest[:-n], rest[-n:]
    # Otherwise cut after the last street suffix ("...-45th-St-Somewhere").
    for j in range(len(rest) - 1, -1, -1):
        if lowered[j] in _STREET_SUFFIXES and j < len(rest) - 1:
            return rest[: j + 1], rest[j + 1:]
    return rest, []


def _parse_zillow(segments: list[str]) -> ParsedListing:
    if not segments:
        return ParsedListing(status="invalid", source="zillow")
    kind = segments[0].lower()
    if kind == "apartments":
        return ParsedListing(status="no_address", source="zillow")
    if kind not in ("homedetails", "b", "homes") or len(segments) < 2:
        return ParsedListing(status="invalid", source="zillow")

    slug = segments[1]
    if kind == "homes":
        # Address search URLs: /homes/123-Main-St-Brooklyn,-NY-11201_rb/
        if not slug.lower().endswith("_rb"):
            return ParsedListing(status="invalid", source="zillow")
        slug = slug[:-3]
    slug = slug.replace(",", "")
    tokens = [t for t in slug.split("-") if t]

    state_idx = max((i for i, t in enumerate(tokens) if t.lower() == "ny"), default=None)
    if state_idx is None:
        if any(t.lower() in _US_STATES_NOT_NY for t in tokens[-3:]):
            return ParsedListing(status="out_of_area", source="zillow")
        return ParsedListing(status="no_address", source="zillow")

    pre = _strip_units(tokens[:state_idx])
    after = tokens[state_idx + 1:]
    zip_code = after[0] if after and re.fullmatch(r"\d{5}", after[0]) else None

    if not pre or not _starts_with_digit(pre[0]):
        return ParsedListing(status="no_address", source="zillow")

    zip_borough = zip_to_borough(zip_code)
    if zip_code and zip_borough is None:
        return ParsedListing(status="out_of_area", source="zillow")

    rest_after_house = pre[1:]
    street_tokens, city_tokens = _split_street_city(rest_after_house)
    city = " ".join(city_tokens).lower()
    borough = zip_borough or _CITY_BOROUGHS.get(city)

    # Queens hyphenated house numbers ("21-15 34th Ave") split into two tokens.
    house = pre[0]
    if borough == "QUEENS" and len(street_tokens) >= 2 and street_tokens[0].isdigit() and "-" not in house:
        house = f"{house}-{street_tokens[0]}"
        street_tokens = street_tokens[1:]

    if not street_tokens:
        return ParsedListing(status="no_address", source="zillow")

    locality = _title(city_tokens) if borough == "QUEENS" and city and city != "queens" else None
    return ParsedListing(
        status="ok",
        source="zillow",
        house_number=house.upper() if not house.isdigit() else house,
        street=_title(street_tokens),
        borough=borough,
        locality=locality,
        zip_code=zip_code,
    )
