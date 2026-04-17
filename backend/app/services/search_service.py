"""Search for NYC residential buildings.

Deterministic rule-based natural language parser — no LLM API required.

Pipeline:
    normalize(query)
    → extract_entities (borough, neighborhood, complaints, filters)
    → match_concepts (noise, pest, heat, structural, hpd, litigation)
    → detect_global_intent (best / worst)
    → build_sort → list[SortClause]
    → compute_confidence → float
    → execute_search (SQL)
"""

import logging
import re
import time
from dataclasses import dataclass
from typing import Any, TypedDict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.sub_neighborhood_splits import SUB_NEIGHBORHOOD_SPLITS

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Simple in-memory TTL cache for NL search results
# ---------------------------------------------------------------------------

_SEARCH_CACHE: dict[str, tuple[dict, float]] = {}
_CACHE_TTL_SECONDS = 60


def _cache_key(query: str, extra_filters: dict | None) -> str:
    extras = "|".join(f"{k}={v}" for k, v in sorted((extra_filters or {}).items()))
    return f"{query.lower().strip()}|{extras}"


# ---------------------------------------------------------------------------
# Lookup tables
# ---------------------------------------------------------------------------

CD_NAMES = {
    "101": "Financial District", "102": "Greenwich Village/SoHo",
    "103": "Lower East Side/Chinatown", "104": "Chelsea/Clinton",
    "105": "Midtown", "106": "Upper West Side", "107": "Upper East Side",
    "108": "Upper Manhattan", "109": "Morningside Heights/Hamilton Heights",
    "110": "Central Harlem", "111": "East Harlem",
    "112": "Washington Heights/Inwood",
    "201": "Mott Haven/Melrose", "202": "Hunts Point/Longwood",
    "203": "Morrisania/Crotona", "204": "Highbridge/Concourse",
    "205": "Fordham/University Heights", "206": "Belmont/East Tremont",
    "207": "Kingsbridge/Riverdale", "208": "Throgs Neck/Pelham Bay",
    "209": "Parkchester/Soundview", "210": "Co-op City/Eastchester",
    "211": "Morris Park/Pelham Parkway", "212": "Williamsbridge/Baychester",
    "301": "Greenpoint/Williamsburg", "302": "Fort Greene/Brooklyn Heights",
    "303": "Bedford-Stuyvesant", "304": "Bushwick", "305": "East New York",
    "306": "Park Slope/Red Hook", "307": "Sunset Park",
    "308": "Crown Heights", "309": "Crown Heights South/Prospect Lefferts",
    "310": "Bay Ridge", "311": "Bensonhurst", "312": "Borough Park",
    "313": "Coney Island", "314": "Flatbush/Midwood",
    "315": "Sheepshead Bay", "316": "Brownsville", "317": "East Flatbush",
    "318": "Canarsie/Flatlands",
    "401": "Astoria/Long Island City", "402": "Woodside/Sunnyside",
    "403": "Jackson Heights", "404": "Elmhurst/Corona",
    "405": "Ridgewood/Glendale", "406": "Forest Hills/Rego Park",
    "407": "Flushing", "408": "Hillcrest/Fresh Meadows",
    "409": "Kew Gardens/Woodhaven", "410": "South Ozone Park/Howard Beach",
    "411": "Bayside/Little Neck", "412": "Jamaica",
    "413": "Queens Village", "414": "The Rockaways",
    "501": "St. George/Stapleton", "502": "South Beach/Willowbrook",
    "503": "Tottenville/Great Kills",
}

NEIGHBORHOOD_ALIASES: dict[str, str] = {
    # Manhattan
    "fidi": "101", "financial district": "101",
    "soho": "102", "the village": "102", "greenwich": "102", "greenwich village": "102",
    "les": "103", "lower east side": "103", "chinatown": "103",
    "chelsea": "104", "hells kitchen": "104", "hell's kitchen": "104", "clinton": "104",
    "midtown": "105", "midtown west": "105", "midtown east": "105", "times square": "105",
    "uws": "106", "upper west side": "106",
    "ues": "107", "upper east side": "107",
    "morningside heights": "109", "hamilton heights": "109",
    "harlem": "110", "central harlem": "110",
    "east harlem": "111", "el barrio": "111", "spanish harlem": "111",
    "washington heights": "112", "inwood": "112",
    # Bronx
    "south bronx": "201", "mott haven": "201",
    "hunts point": "202", "longwood": "202",
    "morrisania": "203", "crotona": "203",
    "highbridge": "204", "concourse": "204", "grand concourse": "204",
    "fordham": "205", "university heights": "205",
    "belmont": "206", "east tremont": "206", "little italy bronx": "206",
    "riverdale": "207", "kingsbridge": "207",
    "throgs neck": "208", "pelham bay": "208",
    "parkchester": "209", "soundview": "209",
    "co-op city": "210", "eastchester": "210",
    "morris park": "211", "pelham parkway": "211",
    "williamsbridge": "212", "baychester": "212",
    # Brooklyn
    "greenpoint": "301", "williamsburg": "301",
    "fort greene": "302", "brooklyn heights": "302", "dumbo": "302",
    "bed-stuy": "303", "bed stuy": "303", "bedford stuyvesant": "303", "bedford-stuyvesant": "303",
    "bushwick": "304",
    "east new york": "305", "eny": "305",
    "park slope": "306", "red hook": "306", "gowanus": "306",
    "sunset park": "307",
    "crown heights": "308",
    "prospect lefferts": "309", "prospect lefferts gardens": "309", "plg": "309",
    "bay ridge": "310", "dyker heights": "310",
    "bensonhurst": "311", "bath beach": "311",
    "borough park": "312", "boro park": "312",
    "coney island": "313", "brighton beach": "313",
    "flatbush": "314", "midwood": "314", "ditmas park": "314",
    "sheepshead bay": "315", "manhattan beach": "315",
    "brownsville": "316",
    "east flatbush": "317",
    "canarsie": "318", "flatlands": "318",
    # Queens
    "astoria": "401", "long island city": "401", "lic": "401",
    "woodside": "402", "sunnyside": "402",
    "jackson heights": "403",
    "elmhurst": "404", "corona": "404",
    "ridgewood": "405", "glendale": "405",
    "forest hills": "406", "rego park": "406",
    "flushing": "407",
    "hillcrest": "408", "fresh meadows": "408",
    "kew gardens": "409", "woodhaven": "409",
    "south ozone park": "410", "howard beach": "410", "ozone park": "410",
    "bayside": "411", "little neck": "411",
    "jamaica": "412",
    "queens village": "413",
    "rockaways": "414", "rockaway": "414", "far rockaway": "414",
    # Staten Island
    "st. george": "501", "st george": "501", "stapleton": "501",
    "south beach": "502", "willowbrook": "502",
    "tottenville": "503", "great kills": "503",
}


# Maps alias → (cd_code, sub_neighborhood_name). Checked before NEIGHBORHOOD_ALIASES
# so that a search for "greenwich village" only returns Greenwich Village, not SoHo.
SUBNBHD_ALIASES: dict[str, tuple[str, str]] = {
    # Manhattan
    "financial district": ("101", "Financial District"), "fidi": ("101", "Financial District"),
    "tribeca": ("101", "Tribeca"),
    "greenwich village": ("102", "Greenwich Village"), "the village": ("102", "Greenwich Village"),
    "greenwich": ("102", "Greenwich Village"), "soho": ("102", "SoHo"),
    "lower east side": ("103", "Lower East Side"), "les": ("103", "Lower East Side"),
    "chinatown": ("103", "Chinatown"),
    "chelsea": ("104", "Chelsea"),
    "hells kitchen": ("104", "Hell's Kitchen"), "hell's kitchen": ("104", "Hell's Kitchen"),
    "clinton": ("104", "Hell's Kitchen"),
    "morningside heights": ("109", "Morningside Heights"),
    "hamilton heights": ("109", "Hamilton Heights"),
    "washington heights": ("112", "Washington Heights"), "inwood": ("112", "Inwood"),
    # Bronx
    "mott haven": ("201", "Mott Haven"), "south bronx": ("201", "Mott Haven"),
    "melrose": ("201", "Melrose"),
    "hunts point": ("202", "Hunts Point"), "longwood": ("202", "Longwood"),
    "morrisania": ("203", "Morrisania"), "crotona": ("203", "Crotona"),
    "highbridge": ("204", "Highbridge"),
    "concourse": ("204", "Concourse"), "grand concourse": ("204", "Concourse"),
    "fordham": ("205", "Fordham"), "university heights": ("205", "University Heights"),
    "belmont": ("206", "Belmont"), "east tremont": ("206", "East Tremont"),
    "little italy bronx": ("206", "Belmont"),
    "kingsbridge": ("207", "Kingsbridge"), "riverdale": ("207", "Riverdale"),
    "parkchester": ("209", "Parkchester"), "soundview": ("209", "Soundview"),
    "morris park": ("211", "Morris Park"),
    # Brooklyn
    "greenpoint": ("301", "Greenpoint"), "williamsburg": ("301", "Williamsburg"),
    "fort greene": ("302", "Fort Greene"),
    "brooklyn heights": ("302", "Brooklyn Heights"), "dumbo": ("302", "Brooklyn Heights"),
    "east new york": ("305", "East New York"), "eny": ("305", "East New York"),
    "park slope": ("306", "Park Slope"),
    "sunset park": ("307", "Sunset Park"), "windsor terrace": ("307", "Windsor Terrace"),
    "prospect lefferts": ("309", "Prospect Lefferts"),
    "prospect lefferts gardens": ("309", "Prospect Lefferts"), "plg": ("309", "Prospect Lefferts"),
    "bay ridge": ("310", "Bay Ridge"), "dyker heights": ("310", "Dyker Heights"),
    "bensonhurst": ("311", "Bensonhurst"), "bath beach": ("311", "Bath Beach"),
    "borough park": ("312", "Borough Park"), "boro park": ("312", "Borough Park"),
    "coney island": ("313", "Coney Island"), "brighton beach": ("313", "Brighton Beach"),
    "flatbush": ("314", "Flatbush"), "ditmas park": ("314", "Flatbush"),
    "midwood": ("314", "Midwood"),
    "sheepshead bay": ("315", "Sheepshead Bay"),
    "brownsville": ("316", "Brownsville"),
    "east flatbush": ("317", "East Flatbush"),
    "canarsie": ("318", "Canarsie"), "flatlands": ("318", "Flatlands"),
    # Queens
    "astoria": ("401", "Astoria"),
    "long island city": ("401", "Long Island City"), "lic": ("401", "Long Island City"),
    "woodside": ("402", "Woodside"), "sunnyside": ("402", "Sunnyside"),
    "jackson heights": ("403", "Jackson Heights"),
    "elmhurst": ("404", "Elmhurst"), "corona": ("404", "South Corona"),
    "ridgewood": ("405", "Ridgewood"), "glendale": ("405", "Glendale"),
    "forest hills": ("406", "Forest Hills"), "rego park": ("406", "Rego Park"),
    "flushing": ("407", "Flushing"),
    "fresh meadows": ("408", "Fresh Meadows"), "hillcrest": ("408", "Fresh Meadows"),
    "woodhaven": ("409", "Woodhaven"), "kew gardens": ("409", "Woodhaven"),
    "howard beach": ("410", "Howard Beach"),
    "south ozone park": ("410", "Ozone Park"), "ozone park": ("410", "Ozone Park"),
    "bayside": ("411", "Bayside"), "little neck": ("411", "Little Neck"),
    "jamaica": ("412", "Jamaica"),
    "queens village": ("413", "Queens Village"),
    "rockaways": ("414", "Rockaway"), "rockaway": ("414", "Rockaway"),
    "far rockaway": ("414", "Rockaway"),
    # Staten Island
    "st. george": ("501", "St. George"), "st george": ("501", "St. George"),
    "stapleton": ("501", "Stapleton"),
    "south beach": ("502", "South Beach"), "willowbrook": ("502", "Willowbrook"),
}

_SUBNBHD_SORTED = sorted(SUBNBHD_ALIASES.items(), key=lambda x: -len(x[0]))

BOROUGH_ALIASES: dict[str, str] = {
    "staten island": "STATEN ISLAND", "si": "STATEN ISLAND",
    "the bronx": "BRONX", "bronx": "BRONX", "bx": "BRONX",
    "manhattan": "MANHATTAN", "mn": "MANHATTAN",
    "brooklyn": "BROOKLYN", "bk": "BROOKLYN", "bklyn": "BROOKLYN",
    "queens": "QUEENS", "qn": "QUEENS", "qns": "QUEENS",
}

# Sorted by length descending so longer matches win
_BOROUGH_SORTED = sorted(BOROUGH_ALIASES.items(), key=lambda x: -len(x[0]))
_NEIGHBORHOOD_SORTED = sorted(NEIGHBORHOOD_ALIASES.items(), key=lambda x: -len(x[0]))

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
MAX_RESULTS = 100

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
    if "most complaints" in q or "by complaints" in q:
        sort_clauses: list[SortClause] = [{"column": "hs.total_complaints", "order": "DESC"}]
    elif "most violations" in q or "by violations" in q:
        sort_clauses = [{"column": "hs.total_violations", "order": "DESC"}]
    else:
        sort_clauses = build_sort(concepts, global_intent)

    confidence = compute_confidence(filters, concepts, global_intent)

    filters["sort"] = sort_clauses
    filters["confidence"] = confidence
    # needs_fallback: no entity filters AND confidence < 0.4
    entity_filter_keys = {"borough", "neighborhood", "complaint_types", "min_score", "max_score",
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
    # Check precise sub-neighborhood aliases first (adds Voronoi filter)
    for alias, (cd_code, sub_name) in _SUBNBHD_SORTED:
        if _word_match(alias, q):
            filters["neighborhood"] = cd_code
            cd_splits = SUB_NEIGHBORHOOD_SPLITS.get(cd_code, [])
            target = next((s for s in cd_splits if s["name"] == sub_name), None)
            if target and len(cd_splits) > 1:
                filters["sub_nbhd"] = {
                    "lat": target["lat"],
                    "lng": target["lng"],
                    "siblings": [s for s in cd_splits if s["name"] != sub_name],
                }
            return
    # Fall back to whole-CD aliases
    for alias, cd_code in _NEIGHBORHOOD_SORTED:
        if _word_match(alias, q):
            filters["neighborhood"] = cd_code
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
        if kw in q:
            filters["max_score"] = 50
            return
    for kw in sorted(good, key=len, reverse=True):
        if kw in q:
            filters["min_score"] = 80
            return
    for kw in sorted(mid, key=len, reverse=True):
        if kw in q:
            filters["min_score"] = 40
            filters["max_score"] = 70
            return


def _extract_litigation(q: str, filters: dict) -> None:
    for kw in LITIGATION_KEYWORDS:
        if kw in q:
            filters["has_litigation"] = True
            return


def _extract_size_filters(q: str, filters: dict) -> None:
    if any(p in q for p in ("large building", "big building", "high rise", "high-rise", "highrise")):
        filters["min_units"] = 50
        return
    if any(p in q for p in ("small building", "walk-up", "walkup", "walk up")):
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
        if keyword in q:
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
    if "neighborhood" in filters:
        if "sub_nbhd" in filters:
            cd_splits = SUB_NEIGHBORHOOD_SPLITS.get(filters["neighborhood"], [])
            sn = filters["sub_nbhd"]
            target = next(
                (s["name"] for s in cd_splits if s["lat"] == sn["lat"] and s["lng"] == sn["lng"]),
                None,
            )
            name = target or CD_NAMES.get(filters["neighborhood"], filters["neighborhood"])
        else:
            name = CD_NAMES.get(filters["neighborhood"], filters["neighborhood"])
        parts.append(f"({name})")
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

    if "neighborhood" in filters and isinstance(filters["neighborhood"], str):
        validated["neighborhood"] = filters["neighborhood"][:100]

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
    if "sub_nbhd" in filters and isinstance(filters["sub_nbhd"], dict):
        validated["sub_nbhd"] = filters["sub_nbhd"]

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

    if filters.get("apartments_only"):
        validated["apartments_only"] = True

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

    if "neighborhood" in filters:
        conditions.append("b.neighborhood ILIKE :neighborhood")
        params["neighborhood"] = f"%{filters['neighborhood']}%"

    if "sub_nbhd" in filters:
        # Voronoi-like filter: keep buildings closer to target centroid than any sibling
        sn = filters["sub_nbhd"]
        params["sub_lng"] = sn["lng"]
        params["sub_lat"] = sn["lat"]
        conditions.append("b.geom IS NOT NULL")
        for i, sib in enumerate(sn["siblings"]):
            conditions.append(
                f"ST_Distance(b.geom::geography, ST_MakePoint(:sub_lng, :sub_lat)::geography) <= "
                f"ST_Distance(b.geom::geography, ST_MakePoint(:sib_{i}_lng, :sib_{i}_lat)::geography)"
            )
            params[f"sib_{i}_lng"] = sib["lng"]
            params[f"sib_{i}_lat"] = sib["lat"]

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

    if filters.get("apartments_only"):
        conditions.append(
            "(b.building_class LIKE 'C%' OR b.building_class LIKE 'D%'"
            " OR b.building_class IN ('R1','R2','R4','R6','RR'))"
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
            b.bbl, b.bin, b.address, b.borough, b.neighborhood,
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


async def search_buildings_ai(
    db: AsyncSession, query: str, extra_filters: dict | None = None
) -> dict:
    """Translate natural language into a structured search using the deterministic pipeline.

    Always uses rule-based parsing — no LLM API calls.
    Returns results dict including confidence and needs_fallback metadata.
    """
    # Check cache first
    key = _cache_key(query, extra_filters)
    cached, ts = _SEARCH_CACHE.get(key, (None, 0.0))
    if cached is not None and (time.monotonic() - ts) < _CACHE_TTL_SECONDS:
        logger.debug("Cache hit for query='%s'", query)
        return cached

    filters = parse_search_query(query)
    if extra_filters:
        filters.update(extra_filters)

    confidence = filters.get("confidence", 0.0)
    needs_fallback = filters.get("needs_fallback", False)

    logger.info(
        "Parsed '%s' → confidence=%.2f needs_fallback=%s filters=%s",
        query, confidence, needs_fallback, {k: v for k, v in filters.items()
                                             if k not in ("sort", "confidence", "needs_fallback")},
    )

    filters = validate_filters(filters)
    results = await execute_search(db, filters)

    clarification = _describe_filters(filters)
    if not results and needs_fallback:
        clarification = (
            "Could not find buildings matching that description. "
            "Try keywords like borough names, neighborhood names, "
            "'rats', 'heat', 'noise', 'worst', 'best', 'pre-war', etc."
        )

    result = {
        "results": results,
        "total": len(results),
        "query": query,
        "clarification": clarification,
        "confidence": confidence,
        "needs_fallback": needs_fallback,
    }
    _SEARCH_CACHE[key] = (result, time.monotonic())
    return result
