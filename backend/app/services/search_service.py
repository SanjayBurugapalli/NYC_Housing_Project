"""Search for NYC residential buildings.

Primary path: Claude Haiku (tool-use) translates natural language into structured
filters that are validated and executed as SQL.

Fallback path: deterministic rule-based parser (regex + lookup tables) runs
automatically if the Claude API call fails or times out.

Pipeline:
    _claude_search(query)        ← primary (Claude Haiku, 6s timeout)
       OR parse_search_query()   ← fallback (rule-based)
    → validate_filters()
    → execute_search (SQL)
"""

import logging
import re
import time
from dataclasses import dataclass
from typing import TypedDict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import MAX_RESULTS

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Simple in-memory TTL cache for NL search results
# ---------------------------------------------------------------------------

_SEARCH_CACHE: dict[str, tuple[dict, float]] = {}
_CACHE_TTL_SECONDS = 60
_CACHE_MAX_ENTRIES = 500


def _cache_key(query: str, extra_filters: dict | None) -> str:
    extras = "|".join(f"{k}={v}" for k, v in sorted((extra_filters or {}).items()))
    return f"{query.lower().strip()}|{extras}"


def _cache_set(key: str, value: dict) -> None:
    if len(_SEARCH_CACHE) >= _CACHE_MAX_ENTRIES:
        # Evict oldest entries (by insertion order) until under cap
        for k in list(_SEARCH_CACHE.keys())[: len(_SEARCH_CACHE) - _CACHE_MAX_ENTRIES + 1]:
            _SEARCH_CACHE.pop(k, None)
    _SEARCH_CACHE[key] = (value, time.monotonic())


# ---------------------------------------------------------------------------
# Lookup tables
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# NTA alias table  (replaces CD_NAMES + NEIGHBORHOOD_ALIASES + SUBNBHD_ALIASES)
# ---------------------------------------------------------------------------
# Maps a search term → NTA name fragment used in  b.nta_name ILIKE '%<pattern>%'
# Multi-word keys must come before their substrings in lookup (handled by sort).
# ---------------------------------------------------------------------------

NTA_ALIASES: dict[str, str] = {
    # Manhattan
    "financial district": "Financial District",
    "fidi": "Financial District",
    "battery park": "Financial District",
    "tribeca": "Tribeca",
    "soho": "SoHo",
    "little italy": "Little Italy",
    "hudson square": "Hudson Square",
    "chinatown": "Chinatown",
    "two bridges": "Two Bridges",
    "lower east side": "Lower East Side",
    "les": "Lower East Side",
    "east village": "East Village",
    "west village": "West Village",
    "greenwich village": "Greenwich Village",
    "the village": "Greenwich Village",
    "greenwich": "Greenwich Village",
    "chelsea": "Chelsea",
    "hell's kitchen": "Hell's Kitchen",
    "hells kitchen": "Hell's Kitchen",
    "clinton": "Hell's Kitchen",
    "midtown": "Midtown",
    "times square": "Times Square",
    "flatiron": "Flatiron",
    "union square": "Flatiron",
    "gramercy": "Gramercy",
    "murray hill": "Murray Hill",
    "kips bay": "Kips Bay",
    "turtle bay": "Turtle Bay",
    "east midtown": "East Midtown",
    "stuyvesant town": "Stuyvesant Town",
    "peter cooper": "Stuyvesant Town",
    "upper west side": "Upper West Side",
    "uws": "Upper West Side",
    "lincoln square": "Lincoln Square",
    "manhattan valley": "Manhattan Valley",
    "upper east side": "Upper East Side",
    "ues": "Upper East Side",
    "yorkville": "Yorkville",
    "lenox hill": "Lenox Hill",
    "carnegie hill": "Carnegie Hill",
    "roosevelt island": "Roosevelt Island",
    "morningside heights": "Morningside Heights",
    "hamilton heights": "Hamilton Heights",
    "sugar hill": "Sugar Hill",
    "harlem": "Harlem",
    "central harlem": "Harlem",
    "east harlem": "East Harlem",
    "el barrio": "East Harlem",
    "spanish harlem": "East Harlem",
    "manhattanville": "Manhattanville",
    "west harlem": "West Harlem",
    "inwood": "Inwood",
    "washington heights": "Washington Heights",
    # Bronx
    "south bronx": "Mott Haven",
    "mott haven": "Mott Haven",
    "port morris": "Mott Haven",
    "melrose": "Melrose",
    "hunts point": "Hunts Point",
    "longwood": "Longwood",
    "morrisania": "Morrisania",
    "crotona": "Crotona Park East",
    "highbridge": "Highbridge",
    "concourse": "Concourse Village",
    "grand concourse": "Concourse Village",
    "fordham": "Fordham",
    "belmont": "Belmont",
    "tremont": "Tremont",
    "east tremont": "Tremont",
    "mount hope": "Mount Hope",
    "riverdale": "Riverdale",
    "kingsbridge": "Kingsbridge",
    "marble hill": "Kingsbridge",
    "pelham bay": "Pelham Bay",
    "pelham parkway": "Pelham Parkway",
    "pelham gardens": "Pelham Gardens",
    "soundview": "Soundview",
    "castle hill": "Castle Hill",
    "parkchester": "Parkchester",
    "morris park": "Morris Park",
    "co-op city": "Co-op City",
    "coop city": "Co-op City",
    "westchester square": "Westchester Square",
    "williamsbridge": "Williamsbridge",
    "baychester": "Eastchester-Baychester",
    "eastchester": "Eastchester-Baychester",
    "wakefield": "Wakefield",
    "allerton": "Allerton",
    "norwood": "Norwood",
    "bedford park": "Bedford Park",
    # Brooklyn
    "greenpoint": "Greenpoint",
    "williamsburg": "Williamsburg",
    "east williamsburg": "East Williamsburg",
    "south williamsburg": "South Williamsburg",
    "bushwick": "Bushwick",
    "bed-stuy": "Bedford-Stuyvesant",
    "bed stuy": "Bedford-Stuyvesant",
    "bedford stuyvesant": "Bedford-Stuyvesant",
    "bedford-stuyvesant": "Bedford-Stuyvesant",
    "ocean hill": "Ocean Hill",
    "crown heights": "Crown Heights",
    "prospect heights": "Prospect Heights",
    "park slope": "Park Slope",
    "windsor terrace": "Windsor Terrace",
    "red hook": "Carroll Gardens",  # same NTA
    "gowanus": "Carroll Gardens",
    "cobble hill": "Carroll Gardens",
    "carroll gardens": "Carroll Gardens",
    "boerum hill": "DUMBO",
    "dumbo": "DUMBO",
    "brooklyn heights": "Brooklyn Heights",
    "fort greene": "Fort Greene",
    "clinton hill": "Clinton Hill",
    "borough park": "Borough Park",
    "boro park": "Borough Park",
    "bensonhurst": "Bensonhurst",
    "bath beach": "Bath Beach",
    "bay ridge": "Bay Ridge",
    "dyker heights": "Dyker Heights",
    "sunset park": "Sunset Park",
    "kensington": "Kensington",
    "flatbush": "Flatbush",
    "ditmas park": "Ditmas Park",
    "midwood": "Midwood",
    "sheepshead bay": "Sheepshead Bay",
    "manhattan beach": "Sheepshead Bay",
    "gerritsen beach": "Sheepshead Bay",
    "coney island": "Coney Island",
    "sea gate": "Coney Island",
    "brighton beach": "Brighton Beach",
    "brownsville": "Brownsville",
    "east flatbush": "East Flatbush",
    "east new york": "East New York",
    "eny": "East New York",
    "cypress hills": "Cypress Hills",
    "canarsie": "Canarsie",
    "flatlands": "Flatlands",
    "marine park": "Marine Park",
    "mill basin": "Marine Park",
    "gravesend": "Gravesend",
    "madison brooklyn": "Madison",
    "mapleton": "Mapleton",
    "prospect lefferts gardens": "Prospect Lefferts Gardens",
    "prospect lefferts": "Prospect Lefferts Gardens",
    "plg": "Prospect Lefferts Gardens",
    "spring creek": "Spring Creek",
    # Queens
    "astoria": "Astoria",
    "ditmars": "Astoria",
    "steinway": "Astoria",
    "old astoria": "Old Astoria",
    "hallets point": "Old Astoria",
    "long island city": "Long Island City",
    "lic": "Long Island City",
    "hunters point": "Long Island City",
    "queensbridge": "Queensbridge-Ravenswood",
    "ravenswood": "Queensbridge-Ravenswood",
    "dutch kills": "Queensbridge-Ravenswood",
    "east elmhurst": "East Elmhurst",
    "woodside": "Woodside",
    "sunnyside": "Sunnyside",
    "jackson heights": "Jackson Heights",
    "elmhurst": "Elmhurst",
    "corona": "Corona",
    "north corona": "North Corona",
    "ridgewood": "Ridgewood",
    "glendale": "Glendale",
    "maspeth": "Maspeth",
    "middle village": "Middle Village",
    "forest hills": "Forest Hills",
    "rego park": "Rego Park",
    "kew gardens": "Kew Gardens",
    "kew gardens hills": "Kew Gardens Hills",
    "woodhaven": "Woodhaven",
    "ozone park": "Ozone Park",
    "south ozone park": "South Ozone Park",
    "howard beach": "Howard Beach",
    "richmond hill": "Richmond Hill",
    "south richmond hill": "South Richmond Hill",
    "flushing": "Flushing",
    "college point": "College Point",
    "auburndale": "Auburndale",
    "east flushing": "East Flushing",
    "queensboro hill": "Queensboro Hill",
    "bayside": "Bayside",
    "whitestone": "Whitestone",
    "little neck": "Little Neck",
    "douglaston": "Douglaston",
    "jamaica": "Jamaica",
    "south jamaica": "South Jamaica",
    "hollis": "Hollis",
    "st. albans": "St. Albans",
    "queens village": "Queens Village",
    "fresh meadows": "Fresh Meadows",
    "hillcrest": "Hillcrest",
    "pomonok": "Hillcrest-Pomonok",
    "rockaways": "Rockaway",
    "far rockaway": "Far Rockaway",
    "rockaway beach": "Rockaway Beach",
    "rockaway peninsula": "Rockaway Peninsula",
    "breezy point": "Rockaway Peninsula",
    "belle harbor": "Rockaway Peninsula",
    "laurelton": "Laurelton",
    "rosedale": "Rosedale",
    "cambria heights": "Cambria Heights",
    "hollis hills": "Jamaica Estates",
    "jamaica estates": "Jamaica Estates",
    "briarwood": "Jamaica Hills",
    "jamaica hills": "Jamaica Hills",
    "bellerose": "Bellerose",
    "oakland gardens": "Oakland Gardens",
    "glen oaks": "Glen Oaks-Floral Park",
    "floral park": "Glen Oaks-Floral Park",
    "bay terrace": "Bay Terrace",
    "clearview": "Bay Terrace",
    "baisley park": "Baisley Park",
    # Staten Island
    "st. george": "St. George",
    "st george": "St. George",
    "new brighton": "St. George",
    "stapleton": "Stapleton",
    "clifton": "Stapleton",
    "rosebank": "Rosebank-Shore Acres",
    "tompkinsville": "Stapleton",
    "port richmond": "Port Richmond",
    "west new brighton": "West New Brighton-Grymes Hill",
    "grymes hill": "West New Brighton-Grymes Hill",
    "silver lake": "West New Brighton-Grymes Hill",
    "westerleigh": "Westerleigh",
    "castleton corners": "Westerleigh",
    "mariners harbor": "Mariner's Harbor",
    "mariner's harbor": "Mariner's Harbor",
    "arlington": "Mariner's Harbor",
    "graniteville": "Mariner's Harbor",
    "new springville": "New Springville-Willowbrook",
    "willowbrook": "New Springville-Willowbrook",
    "bulls head": "New Springville-Willowbrook",
    "richmond": "Oakwood-Richmond Town",
    "oakwood": "Oakwood-Richmond Town",
    "new dorp": "New Dorp",
    "midland beach": "New Dorp",
    "south beach": "Arrochar-South Beach",
    "arrochar": "Arrochar-South Beach",
    "grasmere": "Arrochar-South Beach",
    "dongan hills": "Arrochar-South Beach",
    "great kills": "Great Kills",
    "eltingville": "Great Kills",
    "tottenville": "Tottenville",
    "charleston": "Tottenville",
    "annadale": "Prince's Bay-Annadale",
    "prince's bay": "Prince's Bay-Annadale",
    "huguenot": "Prince's Bay-Annadale",
    "woodrow": "Prince's Bay-Annadale",
    "todt hill": "Todt Hill-Emerson Hill",
    "emerson hill": "Todt Hill-Emerson Hill",
    "lighthouse hill": "Todt Hill-Emerson Hill",
    "manor heights": "Todt Hill-Emerson Hill",
    "arden heights": "Arden Heights",
    "rossville": "Arden Heights",
}

_NTA_SORTED = sorted(NTA_ALIASES.items(), key=lambda x: -len(x[0]))

BOROUGH_ALIASES: dict[str, str] = {
    "staten island": "STATEN ISLAND", "si": "STATEN ISLAND",
    "the bronx": "BRONX", "bronx": "BRONX", "bx": "BRONX",
    "manhattan": "MANHATTAN", "mn": "MANHATTAN",
    "brooklyn": "BROOKLYN", "bk": "BROOKLYN", "bklyn": "BROOKLYN",
    "queens": "QUEENS", "qn": "QUEENS", "qns": "QUEENS",
}

# Sorted by length descending so longer matches win
_BOROUGH_SORTED = sorted(BOROUGH_ALIASES.items(), key=lambda x: -len(x[0]))

COMPLAINT_KEYWORDS: dict[str, str] = {
    # pest (multi-word first)
    "bed bugs": "pest", "bed bug": "pest", "bedbug": "pest", "bedbugs": "pest",
    "cockroach": "pest", "cockroaches": "pest", "roach": "pest", "roaches": "pest",
    "rodent": "pest", "rodents": "pest", "rat": "pest", "rats": "pest",
    "mice": "pest", "mouse": "pest", "pest": "pest", "pests": "pest",
    "vermin": "pest", "infestation": "pest",
    # heat
    "hot water": "heat", "no heat": "heat", "no hot water": "heat",
    "heat": "heat", "heating": "heat", "boiler": "heat",
    # noise
    "noise": "noise", "noisy": "noise", "loud": "noise",
    # structural
    "structural": "structural", "structure": "structural",
    "building code": "structural", "code violation": "structural",
    "elevator": "structural", "fire escape": "structural",
    "collapse": "structural", "foundation": "structural",
    # HPD severity
    "class c": "hpd_c", "hpd c": "hpd_c", "immediately hazardous": "hpd_c",
    "class b": "hpd_b", "hpd b": "hpd_b",
    "class a": "hpd_a", "hpd a": "hpd_a",
}

_COMPLAINT_SORTED = sorted(COMPLAINT_KEYWORDS.items(), key=lambda x: -len(x[0]))

LITIGATION_KEYWORDS = {"lawsuit", "lawsuits", "litigation", "litigations", "sued", "legal action"}

# Maps keyword/phrase → list of building class codes (prefix = all codes starting with letter)
BUILDING_CLASS_KEYWORDS: list[tuple[str, list[str]]] = sorted([
    # One family
    ("one family", ["A"]), ("single family", ["A"]), ("1 family", ["A"]),
    ("cape cod", ["A0"]),
    ("mansion", ["A7"]), ("townhouse", ["A7"]), ("town house", ["A7"]),
    ("bungalow", ["A8"]),
    # Two family
    ("two family", ["B"]), ("duplex", ["B"]), ("2 family", ["B"]),
    # Walk-up apartments
    ("walk up", ["C"]), ("walkup", ["C"]), ("walk-up", ["C"]),
    ("tenement", ["C4"]), ("old law tenement", ["C4"]),
    ("rooming house", ["C5"]),
    ("garden apartment", ["C9"]), ("garden apartments", ["C9"]),
    # Elevator apartments
    ("elevator apartment", ["D"]), ("elevator building", ["D"]),
    ("high rise apartment", ["D"]), ("highrise apartment", ["D"]),
    ("luxury apartment", ["D8"]), ("luxury condo", ["D8", "R4"]),
    ("artist in residence", ["D2"]), ("artists in residence", ["D2"]),
    # Condominiums
    ("condo", ["R"]), ("condominium", ["R"]),
    ("condo rental", ["RR"]),
    # Co-ops / cooperatives
    ("co-op", ["C6", "C8", "D0", "D4", "DC", "CC", "R9"]),
    ("coop", ["C6", "C8", "D0", "D4", "DC", "CC", "R9"]),
    ("cooperative", ["C6", "C8", "D0", "D4", "DC", "CC", "R9"]),
    # Mixed use
    ("mixed use", ["S"]), ("mixed-use", ["S"]),
    # Hotels
    ("hotel", ["H"]), ("motel", ["H4"]),
    ("boutique hotel", ["HB"]),
    ("hostel", ["HH"]),
    ("dormitory", ["H8"]), ("dorm", ["H8"]),
    ("sro", ["HR"]),
    # Warehouses
    ("warehouse", ["E"]), ("self storage", ["E7"]), ("self-storage", ["E7"]),
    # Factories / industrial
    ("factory", ["F"]), ("industrial", ["F"]), ("manufacturing", ["F"]),
    # Offices
    ("office building", ["O"]), ("office", ["O"]),
    # Retail / stores
    ("retail", ["K"]), ("store building", ["K"]),
    ("shopping center", ["K6"]), ("department store", ["K3"]),
    ("restaurant", ["K5"]), ("food establishment", ["K5"]),
    # Lofts
    ("loft", ["L"]),
    # Garages / parking
    ("garage", ["G"]), ("parking garage", ["G1"]),
    ("parking lot", ["G6", "G7"]),
    ("gas station", ["G3", "G4", "G5"]),
    # Religious
    ("church", ["M1"]), ("synagogue", ["M1"]), ("chapel", ["M1"]),
    ("religious", ["M"]),
    # Schools / education
    ("school", ["W"]), ("educational", ["W"]), ("university", ["W5", "W6"]),
    ("college", ["W5", "W6"]),
    # Hospitals / health
    ("hospital", ["I1"]), ("nursing home", ["I6"]),
    ("clinic", ["I5"]), ("health center", ["I5"]),
    # Government
    ("government", ["Y"]),
    ("fire department", ["Y1"]), ("fire station", ["Y1"]),
    ("police", ["Y2"]),
    # Vacant
    ("vacant", ["V"]), ("vacant land", ["V"]),
], key=lambda x: -len(x[0]))

VALID_BOROUGHS = {"MANHATTAN", "BRONX", "BROOKLYN", "QUEENS", "STATEN ISLAND"}

# ---------------------------------------------------------------------------
# Concept definitions
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ConceptDef:
    """Maps a health concern to a health_scores column and per-synonym sort directions.

    Higher score = healthier building. So synonyms that mean "bad" use ASC
    (show worst/lowest score first) and synonyms meaning "good" use DESC.
    """
    column: str               # qualified column name, e.g. "hs.noise_score"
    synonyms: dict[str, str]  # synonym → "ASC" or "DESC"


class SortClause(TypedDict):
    column: str
    order: str  # "ASC" or "DESC"


CONCEPTS: dict[str, ConceptDef] = {
    "noise": ConceptDef(
        column="hs.noise_score",
        synonyms={
            "noise": "ASC",   # buildings with noise issues → low score first
            "noisy": "ASC",
            "loud": "ASC",
            "quiet": "DESC",  # want quiet → high noise_score → DESC
        },
    ),
    "pest": ConceptDef(
        column="hs.pest_rodent_score",
        synonyms={
            "rats": "ASC",
            "rat": "ASC",
            "rodents": "ASC",
            "rodent": "ASC",
            "mice": "ASC",
            "mouse": "ASC",
            "pest": "ASC",
            "pests": "ASC",
            "roach": "ASC",
            "roaches": "ASC",
            "cockroach": "ASC",
            "cockroaches": "ASC",
            "bed bug": "ASC",
            "bed bugs": "ASC",
            "bedbug": "ASC",
            "bedbugs": "ASC",
            "vermin": "ASC",
            "infestation": "ASC",
        },
    ),
    "heat": ConceptDef(
        column="hs.heat_hot_water_score",
        synonyms={
            "heat": "ASC",
            "heating": "ASC",
            "hot water": "ASC",
            "no heat": "ASC",
            "no hot water": "ASC",
            "boiler": "ASC",
        },
    ),
    "structural": ConceptDef(
        column="hs.structural_safety_score",
        synonyms={
            "structural": "ASC",
            "collapse": "ASC",
            "elevator": "ASC",
            "fire escape": "ASC",
            "foundation": "ASC",
            "building code": "ASC",
            "code violation": "ASC",
            "safe": "DESC",
            "unsafe": "ASC",
        },
    ),
    "hpd": ConceptDef(
        column="hs.hpd_severity_score",
        synonyms={
            "hpd": "ASC",
            "violation": "ASC",
            "violations": "ASC",
            "class c": "ASC",
            "class b": "ASC",
            "hazardous": "ASC",
        },
    ),
    "litigation": ConceptDef(
        column="hs.litigation_score",
        synonyms={
            "lawsuit": "ASC",
            "lawsuits": "ASC",
            "litigation": "ASC",
            "litigations": "ASC",
            "sued": "ASC",
            "legal action": "ASC",
        },
    ),
}

# All (synonym, concept_name, order) triples, sorted longest-first so multi-word
# phrases are matched before shorter individual words.
_CONCEPT_SYNONYMS: list[tuple[str, str, str]] = sorted(
    [
        (syn, name, order)
        for name, concept in CONCEPTS.items()
        for syn, order in concept.synonyms.items()
    ],
    key=lambda x: -len(x[0]),
)

# Phrase-level overrides checked before individual synonym matching.
# (phrase, concept_name | None, order)  — None concept → composite_score
PHRASE_OVERRIDES: list[tuple[str, str | None, str]] = sorted([
    ("no heat",         "heat",      "ASC"),
    ("not noisy",       "noise",     "DESC"),
    ("low noise",       "noise",     "DESC"),
    ("high noise",      "noise",     "ASC"),
    ("rat free",        "pest",      "DESC"),
    ("rat-free",        "pest",      "DESC"),
    ("pest free",       "pest",      "DESC"),
    ("pest-free",       "pest",      "DESC"),
    ("low rodent",      "pest",      "DESC"),
    ("high rodent",     "pest",      "ASC"),
    ("low complaints",  None,        "DESC"),
    ("high complaints", None,        "ASC"),
], key=lambda x: -len(x[0]))

# Global "good" / "bad" intent modifiers
_GLOBAL_GOOD = frozenset({
    "best", "healthiest", "safest", "top rated", "highly rated",
    "well maintained", "highest score", "highest rated", "a grade", "grade a",
    "excellent", "good", "healthy",
})
_GLOBAL_BAD = frozenset({
    "worst", "unhealthiest", "most dangerous", "lowest rated",
    "lowest score", "f grade", "grade f", "terrible", "dangerous",
    "unhealthy", "bad", "failing",
})

# Whitelist of columns permitted in ORDER BY (prevents injection)
_ALLOWED_SORT_COLUMNS = frozenset({
    "hs.noise_score",
    "hs.pest_rodent_score",
    "hs.heat_hot_water_score",
    "hs.structural_safety_score",
    "hs.hpd_severity_score",
    "hs.litigation_score",
    "hs.composite_score",
    "hs.total_complaints",
    "hs.total_violations",
})

# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------


def normalize(query: str) -> str:
    """Lowercase, collapse whitespace, strip punctuation (keep hyphens/apostrophes)."""
    q = query.lower().strip()
    q = re.sub(r"[^\w\s\-']", " ", q)
    q = re.sub(r"\s+", " ", q).strip()
    return q


# ---------------------------------------------------------------------------
# Concept pipeline
# ---------------------------------------------------------------------------


def match_concepts(q: str) -> list[SortClause]:
    """Identify health-score concepts mentioned in the query.

    Checks PHRASE_OVERRIDES first (longest match wins), then individual
    synonyms. Each matched column appears at most once (first match wins).

    Negation context (without/no/not/free from before a synonym within 60 chars)
    flips the sort direction — e.g. "without rats" → DESC (want good pest score).
    """
    matched_columns: set[str] = set()
    result: list[SortClause] = []

    # Pre-compute negation spans: (start, start+60) for each negation word found
    neg_re = re.compile(r"\b(?:without|no\s+|not having|not any|not|free from|lacking)\b")
    neg_spans = [(m.start(), m.start() + 60) for m in neg_re.finditer(q)]

    def _in_negation(pos: int) -> bool:
        return any(s <= pos <= e for s, e in neg_spans)

    def _flip(order: str) -> str:
        return "ASC" if order == "DESC" else "DESC"

    # Phase 1: phrase overrides (checked longest-first — no negation flip for phrases
    # since phrases like "not noisy" are already encoded with the correct direction)
    for phrase, concept_name, order in PHRASE_OVERRIDES:
        m = re.search(r"\b" + re.escape(phrase) + r"\b", q)
        if m:
            col = CONCEPTS[concept_name].column if concept_name else "hs.composite_score"
            if col not in matched_columns:
                matched_columns.add(col)
                result.append({"column": col, "order": order})

    # Phase 2: individual synonyms (longest synonym first, negation-aware)
    for syn, concept_name, order in _CONCEPT_SYNONYMS:
        m = re.search(r"\b" + re.escape(syn) + r"\b", q)
        if m:
            col = CONCEPTS[concept_name].column
            if col not in matched_columns:
                matched_columns.add(col)
                effective_order = _flip(order) if _in_negation(m.start()) else order
                result.append({"column": col, "order": effective_order})

    return result


def detect_global_intent(q: str) -> str | None:
    """Detect "best"/"worst" global intent modifiers (word-boundary matched).

    Returns "best", "worst", or None.
    """
    for kw in sorted(_GLOBAL_GOOD, key=len, reverse=True):
        if re.search(r"\b" + re.escape(kw) + r"\b", q):
            return "best"
    for kw in sorted(_GLOBAL_BAD, key=len, reverse=True):
        if re.search(r"\b" + re.escape(kw) + r"\b", q):
            return "worst"
    return None


def build_sort(concepts: list[SortClause], global_intent: str | None) -> list[SortClause]:
    """Produce the final ordered sort list.

    - No concepts matched + no intent  → composite_score DESC (default)
    - No concepts matched + "worst"    → composite_score ASC
    - Concepts matched + global intent → override all concept directions
    - Concepts matched, no global      → use per-concept directions
    """
    if not concepts:
        order = "ASC" if global_intent == "worst" else "DESC"
        return [{"column": "hs.composite_score", "order": order}]

    if global_intent in ("best", "worst"):
        direction = "DESC" if global_intent == "best" else "ASC"
        return [{"column": c["column"], "order": direction} for c in concepts]

    return list(concepts)


def compute_confidence(filters: dict, concepts: list[SortClause], global_intent: str | None) -> float:
    """Estimate how well the query was understood (0–1).

    +0.4  borough detected
    +0.3  ≥1 concept matched
    +0.2  explicit intent detected (global or score range filter)
    +0.1  ≥2 concepts matched
    """
    score = 0.0
    if "borough" in filters:
        score += 0.4
    if "nta_name" in filters:
        score += 0.3
    if concepts:
        score += 0.3
        if len(concepts) >= 2:
            score += 0.1
    if global_intent is not None or any(k in filters for k in ("min_score", "max_score")):
        score += 0.2
    return min(1.0, score)


# ---------------------------------------------------------------------------
# Query parser
# ---------------------------------------------------------------------------


def parse_search_query(query: str) -> dict:
    """Parse a natural language search query into structured filters.

    Returns a dict with all WHERE filter keys plus:
      sort        : list[SortClause] — ordered sort columns for ORDER BY
      confidence  : float — 0–1 estimate of parse quality
      needs_fallback : bool — True if query is likely too vague for useful results
    """
    q = normalize(query)
    filters: dict = {}

    # Entity / filter extraction (order matters: entity extraction before stopword logic)
    _extract_borough(q, filters)
    _extract_neighborhood(q, filters)
    _extract_complaint_types(q, filters)
    _extract_score_filters(q, filters)
    _extract_litigation(q, filters)
    _extract_size_filters(q, filters)
    _extract_year_filters(q, filters)
    _extract_building_class(q, filters)
    _extract_owner(q, filters)
    _extract_limit(q, filters)

    # Concept pipeline determines sort and contributes to confidence
    concepts = match_concepts(q)
    global_intent = detect_global_intent(q)

    # Special-case: explicit sort-by-count phrases override concept sort
    if _word_match("most complaints", q) or _word_match("by complaints", q):
        sort_clauses: list[SortClause] = [{"column": "hs.total_complaints", "order": "DESC"}]
    elif _word_match("most violations", q) or _word_match("by violations", q):
        sort_clauses = [{"column": "hs.total_violations", "order": "DESC"}]
    else:
        sort_clauses = build_sort(concepts, global_intent)

    confidence = compute_confidence(filters, concepts, global_intent)

    filters["sort"] = sort_clauses
    filters["confidence"] = confidence
    # needs_fallback: no entity filters AND confidence < 0.4
    entity_filter_keys = {"borough", "nta_name", "complaint_types", "min_score", "max_score",
                          "has_litigation", "min_units", "max_units", "min_year_built",
                          "max_year_built", "building_classes", "owner_name"}
    has_entity_filters = bool(entity_filter_keys & filters.keys())
    filters["needs_fallback"] = not has_entity_filters and confidence < 0.4

    return filters


def _word_match(needle: str, haystack: str) -> bool:
    """Check if needle appears as a whole word/phrase in haystack."""
    return bool(re.search(r"\b" + re.escape(needle) + r"\b", haystack))


def _extract_borough(q: str, filters: dict) -> None:
    for alias, borough in _BOROUGH_SORTED:
        if _word_match(alias, q):
            filters["borough"] = borough
            return


def _extract_neighborhood(q: str, filters: dict) -> None:
    """Match NTA aliases (longest first) and store a pattern for ILIKE filtering."""
    for alias, nta_pattern in _NTA_SORTED:
        if _word_match(alias, q):
            filters["nta_name"] = nta_pattern
            return


_NEGATION_RE = re.compile(
    r"\b(?:without|no|not having|not any|not|free from|lacking)\b"
)


def _extract_complaint_types(q: str, filters: dict) -> None:
    # Find negation spans: from the negation word up to 60 chars ahead
    neg_spans = [(m.start(), m.start() + 60) for m in _NEGATION_RE.finditer(q)]

    found: set[str] = set()
    excluded: set[str] = set()

    for keyword, complaint_type in _COMPLAINT_SORTED:
        for m in re.finditer(r"\b" + re.escape(keyword) + r"\b", q):
            pos = m.start()
            in_negation = any(s <= pos <= e for s, e in neg_spans)
            if in_negation:
                excluded.add(complaint_type)
            else:
                found.add(complaint_type)

    # Handle "X-free" pattern (e.g. "rat-free", "pest-free")
    for m in re.finditer(r"\b(\w+)-free\b", q):
        ct = COMPLAINT_KEYWORDS.get(m.group(1))
        if ct:
            excluded.add(ct)

    # Negation wins over positive match
    found -= excluded

    if found:
        filters["complaint_types"] = list(found)
    if excluded:
        filters["exclude_complaint_types"] = list(excluded)


def _extract_score_filters(q: str, filters: dict) -> None:
    """Set min/max composite score ranges. Sort direction is handled by build_sort."""
    bad = {"worst", "unhealthy", "unhealthiest", "bad", "terrible", "dangerous",
           "failing", "lowest score", "lowest rated", "f grade", "grade f"}
    good = {"best", "healthy", "healthiest", "good", "excellent", "top rated",
            "highest score", "highest rated", "a grade", "grade a", "well maintained"}
    mid = {"average", "moderate", "mediocre"}

    for kw in sorted(bad, key=len, reverse=True):
        if _word_match(kw, q):
            filters["max_score"] = 50
            return
    for kw in sorted(good, key=len, reverse=True):
        if _word_match(kw, q):
            filters["min_score"] = 80
            return
    for kw in sorted(mid, key=len, reverse=True):
        if _word_match(kw, q):
            filters["min_score"] = 40
            filters["max_score"] = 70
            return


def _extract_litigation(q: str, filters: dict) -> None:
    for kw in LITIGATION_KEYWORDS:
        if _word_match(kw, q):
            filters["has_litigation"] = True
            return


def _extract_size_filters(q: str, filters: dict) -> None:
    if any(_word_match(p, q) for p in ("large building", "big building", "high rise", "high-rise", "highrise")):
        filters["min_units"] = 50
        return
    if any(_word_match(p, q) for p in ("small building", "walk-up", "walkup", "walk up")):
        filters["max_units"] = 10
        return

    m = re.search(r"\b(?:more than|over|at least|>=?)\s*(\d+)\s*units?\b", q)
    if m:
        filters["min_units"] = int(m.group(1))
        return
    m = re.search(r"\b(\d+)\+\s*units?\b", q)
    if m:
        filters["min_units"] = int(m.group(1))
        return
    m = re.search(r"\b(?:less than|under|fewer than|<=?)\s*(\d+)\s*units?\b", q)
    if m:
        filters["max_units"] = int(m.group(1))
        return


def _extract_year_filters(q: str, filters: dict) -> None:
    if re.search(r"\bpre[\s-]?war\b", q):
        filters["max_year_built"] = 1945
        return
    if re.search(r"\bpost[\s-]?war\b", q):
        filters["min_year_built"] = 1946
        return

    m = re.search(r"\b(?:built\s+)?before\s+(\d{4})\b", q)
    if m:
        filters["max_year_built"] = int(m.group(1))
        return
    m = re.search(r"\bpre[\s-]?(\d{4})\b", q)
    if m:
        filters["max_year_built"] = int(m.group(1))
        return

    m = re.search(r"\b(?:built\s+)?after\s+(\d{4})\b", q)
    if m:
        filters["min_year_built"] = int(m.group(1))
        return

    m = re.search(r"\b(?:from|in)\s+(?:the\s+)?(\d{4})s\b", q)
    if m:
        decade = int(m.group(1))
        filters["min_year_built"] = decade
        filters["max_year_built"] = decade + 9
        return

    if re.search(r"\b(?:new(?:ly)?\s+(?:construction|built)|recent\s+construction)\b", q):
        filters["min_year_built"] = 2010
        return
    if re.search(r"\bold\s+building", q):
        filters["max_year_built"] = 1950
        return


_OWNER_RE = re.compile(
    r"\b(?:owned by|owner|landlord|managed by|property of)\s+(.{2,50}?)(?=\s+(?:in|at|with|that|has|have|near|and|or)\b|\s*$)"
)


def _extract_limit(q: str, filters: dict) -> None:
    # Only extract if there's a clear "N buildings" / "top N" / "best N" intent
    m = re.search(
        r"\b(?:(?:top|best|worst|bottom)\s+(\d+)|(\d+)\s+(?:best|worst|top|bottom)|"
        r"show\s+(?:me\s+)?(\d+)|find\s+(?:me\s+)?(\d+)|give\s+(?:me\s+)?(\d+))\b",
        q,
    )
    if m:
        n = next(int(g) for g in m.groups() if g is not None)
        if 1 <= n <= MAX_RESULTS:
            filters["limit"] = n


def _extract_building_class(q: str, filters: dict) -> None:
    """Match building class keywords and set building_classes filter.

    Single-letter codes (e.g. "A") are treated as prefix matches (A%) in execute_search.
    Multi-char codes (e.g. "A9") are exact matches.
    """
    # Direct code mention: "class A9", "type C", "building class D"
    m = re.search(r"\b(?:building\s+)?(?:class|type|code)\s+([A-Za-z][A-Za-z0-9]?)\b", q)
    if m:
        filters["building_classes"] = [m.group(1).upper()]
        return

    for keyword, codes in BUILDING_CLASS_KEYWORDS:
        if _word_match(keyword, q):
            filters["building_classes"] = codes
            return


def _extract_owner(q: str, filters: dict) -> None:
    m = _OWNER_RE.search(q)
    if m:
        name = m.group(1).strip().rstrip(".,")
        if name:
            filters["owner_name"] = name


# ---------------------------------------------------------------------------
# Filter description (clarification text shown to users)
# ---------------------------------------------------------------------------


def _describe_filters(filters: dict) -> str | None:
    """Generate a human-readable description of the active filters."""
    parts: list[str] = []
    if "borough" in filters:
        parts.append(f"in {filters['borough'].title()}")
    if "nta_name" in filters:
        parts.append(f"({filters['nta_name']})")
    if "complaint_types" in filters:
        parts.append(f"with {', '.join(filters['complaint_types'])} issues")
    if "exclude_complaint_types" in filters:
        parts.append(f"without {', '.join(filters['exclude_complaint_types'])} issues")
    if "has_litigation" in filters:
        parts.append("with litigation history")
    if "building_classes" in filters:
        parts.append(f"building class {'/'.join(filters['building_classes'])}")
    if "owner_name" in filters:
        parts.append(f"owned by '{filters['owner_name']}'")
    if "min_score" in filters or "max_score" in filters:
        lo = filters.get("min_score", 0)
        hi = filters.get("max_score", 100)
        parts.append(f"score {lo}-{hi}")
    if "min_year_built" in filters or "max_year_built" in filters:
        if "min_year_built" in filters and "max_year_built" in filters:
            parts.append(f"built {filters['min_year_built']}-{filters['max_year_built']}")
        elif "min_year_built" in filters:
            parts.append(f"built after {filters['min_year_built']}")
        else:
            parts.append(f"built before {filters['max_year_built']}")
    if "min_units" in filters or "max_units" in filters:
        if "min_units" in filters and "max_units" in filters:
            parts.append(f"{filters['min_units']}-{filters['max_units']} units")
        elif "min_units" in filters:
            parts.append(f"{filters['min_units']}+ units")
        else:
            parts.append(f"up to {filters['max_units']} units")
    if not parts:
        return None
    prefix = f"Top {filters['limit']} buildings" if "limit" in filters else "Showing buildings"
    return prefix + " " + " ".join(parts) + "."


# ---------------------------------------------------------------------------
# Filter validation
# ---------------------------------------------------------------------------


def validate_filters(filters: dict) -> dict:
    """Validate and sanitize filter values."""
    validated = {}

    if "borough" in filters and filters["borough"] in VALID_BOROUGHS:
        validated["borough"] = filters["borough"]

    if "nta_name" in filters and isinstance(filters["nta_name"], str):
        validated["nta_name"] = filters["nta_name"][:120]

    for key in ["min_score", "max_score"]:
        if key in filters and isinstance(filters[key], (int, float)):
            validated[key] = max(0, min(100, filters[key]))

    valid_categories = {"heat", "pest", "noise", "structural", "hpd_a", "hpd_b", "hpd_c"}
    if "complaint_types" in filters and isinstance(filters["complaint_types"], list):
        validated["complaint_types"] = [
            ct for ct in filters["complaint_types"] if ct in valid_categories
        ]
    if "exclude_complaint_types" in filters and isinstance(filters["exclude_complaint_types"], list):
        validated["exclude_complaint_types"] = [
            ct for ct in filters["exclude_complaint_types"] if ct in valid_categories
        ]
    for key in ["min_units", "max_units"]:
        if key in filters and isinstance(filters[key], int):
            validated[key] = max(1, min(10000, filters[key]))

    for key in ["min_year_built", "max_year_built"]:
        if key in filters and isinstance(filters[key], int):
            validated[key] = max(1800, min(2030, filters[key]))

    if "building_class" in filters and isinstance(filters["building_class"], str):
        validated["building_class"] = filters["building_class"][:10]

    if "building_classes" in filters and isinstance(filters["building_classes"], list):
        validated["building_classes"] = [
            c[:10] for c in filters["building_classes"]
            if isinstance(c, str) and re.match(r"^[A-Z][A-Z0-9]?$", c)
        ]

    if "has_litigation" in filters and isinstance(filters["has_litigation"], bool):
        validated["has_litigation"] = filters["has_litigation"]

    if "owner_name" in filters and isinstance(filters["owner_name"], str):
        validated["owner_name"] = filters["owner_name"][:100]

    if "limit" in filters and isinstance(filters["limit"], int):
        validated["limit"] = max(1, min(MAX_RESULTS, filters["limit"]))

    if "include_small_homes" in filters:
        validated["include_small_homes"] = bool(filters["include_small_homes"])

    # Pass through sort list after whitelisting columns
    if "sort" in filters and isinstance(filters["sort"], list):
        safe_sort = [
            sc for sc in filters["sort"]
            if isinstance(sc, dict)
            and sc.get("column") in _ALLOWED_SORT_COLUMNS
            and sc.get("order") in ("ASC", "DESC")
        ]
        validated["sort"] = safe_sort or [{"column": "hs.composite_score", "order": "DESC"}]

    # Pass through confidence / needs_fallback metadata
    if "confidence" in filters:
        validated["confidence"] = filters["confidence"]
    if "needs_fallback" in filters:
        validated["needs_fallback"] = filters["needs_fallback"]

    return validated


# ---------------------------------------------------------------------------
# SQL execution
# ---------------------------------------------------------------------------


async def execute_search(db: AsyncSession, filters: dict) -> list[dict]:
    """Execute validated search filters against the database."""
    conditions = []
    params: dict = {"limit": filters.get("limit", MAX_RESULTS)}

    if "borough" in filters:
        conditions.append("b.borough = :borough")
        params["borough"] = filters["borough"]

    if "nta_name" in filters:
        conditions.append("b.nta_name ILIKE :nta_name")
        params["nta_name"] = f"%{filters['nta_name']}%"

    if "min_score" in filters:
        conditions.append("hs.composite_score >= :min_score")
        params["min_score"] = filters["min_score"]

    if "max_score" in filters:
        conditions.append("hs.composite_score <= :max_score")
        params["max_score"] = filters["max_score"]

    if "min_units" in filters:
        conditions.append("b.residential_units >= :min_units")
        params["min_units"] = filters["min_units"]

    if "max_units" in filters:
        conditions.append("b.residential_units <= :max_units")
        params["max_units"] = filters["max_units"]

    if "min_year_built" in filters:
        conditions.append("b.year_built >= :min_year_built")
        params["min_year_built"] = filters["min_year_built"]

    if "max_year_built" in filters:
        conditions.append("b.year_built <= :max_year_built")
        params["max_year_built"] = filters["max_year_built"]

    if "building_class" in filters:
        conditions.append("b.building_class = :building_class")
        params["building_class"] = filters["building_class"]

    if filters.get("building_classes"):
        clauses = []
        for i, code in enumerate(filters["building_classes"]):
            if len(code) == 1:
                # Single letter = prefix match (e.g. "A" → all A* codes)
                clauses.append(f"b.building_class LIKE :bclass_{i}")
                params[f"bclass_{i}"] = f"{code}%"
            else:
                clauses.append(f"b.building_class = :bclass_{i}")
                params[f"bclass_{i}"] = code
        conditions.append("(" + " OR ".join(clauses) + ")")

    if filters.get("complaint_types"):
        conditions.append("""
            EXISTS (
                SELECT 1 FROM complaints c
                WHERE c.bbl = b.bbl AND c.category = ANY(:complaint_types)
            )
        """)
        params["complaint_types"] = filters["complaint_types"]

    if filters.get("exclude_complaint_types"):
        conditions.append("""
            NOT EXISTS (
                SELECT 1 FROM complaints c
                WHERE c.bbl = b.bbl AND c.category = ANY(:exclude_complaint_types)
            )
        """)
        params["exclude_complaint_types"] = filters["exclude_complaint_types"]

    if "has_litigation" in filters:
        if filters["has_litigation"]:
            conditions.append("EXISTS (SELECT 1 FROM litigations l WHERE l.bbl = b.bbl)")
        else:
            conditions.append("NOT EXISTS (SELECT 1 FROM litigations l WHERE l.bbl = b.bbl)")

    if "owner_name" in filters:
        conditions.append("b.owner_name ILIKE :owner_name")
        params["owner_name"] = f"%{filters['owner_name']}%"

    if not filters.get("include_small_homes"):
        conditions.append(
            "b.building_class NOT LIKE 'A%' AND b.building_class NOT LIKE 'B%'"
        )

    # Build ORDER BY from sort list (validated columns only)
    sort_list: list[SortClause] = filters.get("sort", [])
    if sort_list:
        order_by = ", ".join(
            f"{sc['column']} {sc['order']} NULLS LAST" for sc in sort_list
        )
    else:
        order_by = "hs.composite_score DESC NULLS LAST"

    where_clause = " AND ".join(conditions) if conditions else "TRUE"

    query = text(f"""
        SELECT
            b.bbl, b.bin, b.address, b.borough, b.neighborhood, b.nta_name,
            COALESCE(hs.composite_score, 0) as health_score,
            b.latitude, b.longitude,
            b.residential_units, b.year_built, b.building_class
        FROM buildings b
        LEFT JOIN health_scores hs ON hs.building_id = b.id
        WHERE {where_clause}
        ORDER BY {order_by}
        LIMIT :limit
    """)

    result = await db.execute(query, params)
    return [dict(row._mapping) for row in result]


# ---------------------------------------------------------------------------
# Search entry point
# ---------------------------------------------------------------------------


ENTITY_FILTER_KEYS = frozenset({
    "borough", "nta_name", "complaint_types", "exclude_complaint_types",
    "min_score", "max_score", "has_litigation", "min_units", "max_units",
    "min_year_built", "max_year_built", "building_classes", "building_class",
    "owner_name",
})

UNPARSEABLE_MESSAGE = (
    "Could not understand that query. "
    "Try keywords like borough names ('Brooklyn'), neighborhoods ('Astoria'), "
    "issues ('rats', 'heat', 'noise'), or intent ('worst', 'best', 'pre-war')."
)


async def search_buildings_ai(
    db: AsyncSession, query: str, extra_filters: dict | None = None
) -> dict:
    """Translate natural language into a structured search.

    Tries Claude Haiku first; falls back to the deterministic rule-based parser
    when the API key is missing, the call fails, or the response is empty.
    Returns results dict including confidence and needs_fallback metadata.

    If no parser path produces any entity filters, the SQL is skipped and an
    empty result set is returned with a clarification — otherwise an unparseable
    query (e.g. "asdfgh") would silently match every building and dump the
    top-scored 100 city-wide.
    """
    key = _cache_key(query, extra_filters)
    cached, ts = _SEARCH_CACHE.get(key, (None, 0.0))
    if cached is not None and (time.monotonic() - ts) < _CACHE_TTL_SECONDS:
        logger.debug("Cache hit for query='%s'", query)
        return cached

    parser_used = "rule_based"
    from app.services.claude_search_parser import claude_confidence, parse_query_with_claude

    claude_filters = await parse_query_with_claude(query)
    if claude_filters is not None and claude_filters:
        filters = claude_filters
        # Default sort if Claude didn't provide one
        filters.setdefault("sort", [{"column": "hs.composite_score", "order": "DESC"}])
        filters["confidence"] = claude_confidence(filters)
        parser_used = "claude"
    else:
        filters = parse_search_query(query)

    if extra_filters:
        filters.update(extra_filters)

    # If the parser identified an A% or B% (1–2 family) class, the user explicitly
    # asked for those — override the default exclusion so the query returns rows.
    bclasses = filters.get("building_classes") or []
    if any(isinstance(c, str) and c[:1] in ("A", "B") for c in bclasses):
        filters["include_small_homes"] = True

    # Recompute needs_fallback against the final merged filter set so the Claude
    # path, the rule-based path, and API-side overrides all agree on what
    # "unparseable" means.
    has_entity_filters = bool(ENTITY_FILTER_KEYS & filters.keys())
    filters["needs_fallback"] = not has_entity_filters

    confidence = filters.get("confidence", 0.0)
    needs_fallback = filters["needs_fallback"]

    logger.info(
        "Parsed '%s' via %s → confidence=%.2f needs_fallback=%s filters=%s",
        query, parser_used, confidence, needs_fallback,
        {k: v for k, v in filters.items()
         if k not in ("sort", "confidence", "needs_fallback")},
    )

    filters = validate_filters(filters)

    if needs_fallback:
        # Skip the SQL — without any WHERE conditions it would return the
        # top-100 buildings city-wide, which is misleading for a query the
        # parser couldn't make sense of.
        result = {
            "results": [],
            "total": 0,
            "query": query,
            "clarification": UNPARSEABLE_MESSAGE,
            "confidence": confidence,
            "needs_fallback": True,
        }
        _cache_set(key, result)
        return result

    results = await execute_search(db, filters)
    clarification = _describe_filters(filters)

    result = {
        "results": results,
        "total": len(results),
        "query": query,
        "clarification": clarification,
        "confidence": confidence,
        "needs_fallback": needs_fallback,
    }
    _cache_set(key, result)
    return result
