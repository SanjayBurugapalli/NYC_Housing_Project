"""Search for NYC residential buildings.

Combines keyword parsing (fast, no API needed) with Claude API fallback
for complex natural language queries.
"""

import logging
import re

import anthropic
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

logger = logging.getLogger(__name__)

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

VALID_BOROUGHS = {"MANHATTAN", "BRONX", "BROOKLYN", "QUEENS", "STATEN ISLAND"}
MAX_RESULTS = 100

# ---------------------------------------------------------------------------
# Query parser
# ---------------------------------------------------------------------------


def parse_search_query(query: str) -> dict:
    """Parse a natural language search query into structured filters."""
    filters: dict = {}
    q = query.lower().strip()

    _extract_borough(q, filters)
    _extract_neighborhood(q, filters)
    _extract_complaint_types(q, filters)
    _extract_score_filters(q, filters)
    _extract_litigation(q, filters)
    _extract_size_filters(q, filters)
    _extract_year_filters(q, filters)
    _extract_sort(q, filters)

    return filters


def _word_match(needle: str, haystack: str) -> bool:
    """Check if needle appears as a whole word/phrase in haystack."""
    return bool(re.search(r'\b' + re.escape(needle) + r'\b', haystack))


def _extract_borough(q: str, filters: dict) -> None:
    for alias, borough in _BOROUGH_SORTED:
        if _word_match(alias, q):
            filters["borough"] = borough
            return


def _extract_neighborhood(q: str, filters: dict) -> None:
    for alias, cd_code in _NEIGHBORHOOD_SORTED:
        if _word_match(alias, q):
            filters["neighborhood"] = cd_code
            return


def _extract_complaint_types(q: str, filters: dict) -> None:
    found: set[str] = set()
    for keyword, complaint_type in _COMPLAINT_SORTED:
        if keyword in q:
            found.add(complaint_type)
    if found:
        filters["complaint_types"] = list(found)


def _extract_score_filters(q: str, filters: dict) -> None:
    bad = {"worst", "unhealthy", "unhealthiest", "bad", "terrible", "dangerous",
           "failing", "lowest score", "lowest rated", "f grade", "grade f"}
    good = {"best", "healthy", "healthiest", "good", "excellent", "top rated",
            "highest score", "highest rated", "a grade", "grade a", "well maintained"}
    mid = {"average", "moderate", "mediocre"}

    for kw in sorted(bad, key=len, reverse=True):
        if kw in q:
            filters["max_score"] = 50
            filters.setdefault("sort_by", "score_asc")
            return
    for kw in sorted(good, key=len, reverse=True):
        if kw in q:
            filters["min_score"] = 80
            filters.setdefault("sort_by", "score_desc")
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

    m = re.search(r'\b(?:more than|over|at least|>=?)\s*(\d+)\s*units?\b', q)
    if m:
        filters["min_units"] = int(m.group(1))
        return
    m = re.search(r'\b(\d+)\+\s*units?\b', q)
    if m:
        filters["min_units"] = int(m.group(1))
        return
    m = re.search(r'\b(?:less than|under|fewer than|<=?)\s*(\d+)\s*units?\b', q)
    if m:
        filters["max_units"] = int(m.group(1))
        return


def _extract_year_filters(q: str, filters: dict) -> None:
    if re.search(r'\bpre[\s-]?war\b', q):
        filters["max_year_built"] = 1945
        return
    if re.search(r'\bpost[\s-]?war\b', q):
        filters["min_year_built"] = 1946
        return

    m = re.search(r'\b(?:built\s+)?before\s+(\d{4})\b', q)
    if m:
        filters["max_year_built"] = int(m.group(1))
        return
    m = re.search(r'\bpre[\s-]?(\d{4})\b', q)
    if m:
        filters["max_year_built"] = int(m.group(1))
        return

    m = re.search(r'\b(?:built\s+)?after\s+(\d{4})\b', q)
    if m:
        filters["min_year_built"] = int(m.group(1))
        return

    m = re.search(r'\b(?:from|in)\s+(?:the\s+)?(\d{4})s\b', q)
    if m:
        decade = int(m.group(1))
        filters["min_year_built"] = decade
        filters["max_year_built"] = decade + 9
        return

    if re.search(r'\b(?:new(?:ly)?\s+(?:construction|built)|recent\s+construction)\b', q):
        filters["min_year_built"] = 2010
        return
    if re.search(r'\bold\s+building', q):
        filters["max_year_built"] = 1950
        return


def _extract_sort(q: str, filters: dict) -> None:
    if "sort_by" in filters:
        return
    if "most complaints" in q or "by complaints" in q:
        filters["sort_by"] = "complaints"
    elif "most violations" in q or "by violations" in q:
        filters["sort_by"] = "violations"
    elif "complaint_types" in filters or "has_litigation" in filters:
        filters["sort_by"] = "score_asc"


def _describe_filters(filters: dict) -> str | None:
    """Generate a human-readable description of the active filters."""
    parts: list[str] = []
    if "borough" in filters:
        parts.append(f"in {filters['borough'].title()}")
    if "neighborhood" in filters:
        name = CD_NAMES.get(filters["neighborhood"], filters["neighborhood"])
        parts.append(f"({name})")
    if "complaint_types" in filters:
        parts.append(f"with {', '.join(filters['complaint_types'])} issues")
    if "has_litigation" in filters:
        parts.append("with litigation history")
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
    return "Showing buildings " + " ".join(parts) + "."


# ---------------------------------------------------------------------------
# Search entry point + query execution (unchanged from original)
# ---------------------------------------------------------------------------


async def search_buildings_ai(
    db: AsyncSession, query: str
) -> dict:
    """Translate natural language into a structured search.

    Strategy: try keyword parsing first (fast). If no filters extracted,
    fall through to Claude API for complex queries.
    """
    # 1. Try keyword parsing
    filters = parse_search_query(query)

    if filters:
        logger.info(f"Keyword parsed '{query}' -> {filters}")
        filters = validate_filters(filters)
        results = await execute_search(db, filters)
        return {
            "results": results,
            "total": len(results),
            "query": query,
            "clarification": _describe_filters(filters),
        }

    # 2. Fall through to Claude API
    logger.info(f"No keyword match for '{query}', trying Claude API")
    return await _claude_search(db, query)


async def _claude_search(db: AsyncSession, query: str) -> dict:
    """Use Claude API tool-use to translate query into structured filters."""
    if not settings.anthropic_api_key:
        return {
            "results": [],
            "total": 0,
            "query": query,
            "clarification": (
                "Could not understand the search query. "
                "Try keywords like borough names, neighborhood names, "
                "'rat', 'heat', 'noise', 'worst', 'best', 'pre-war', etc."
            ),
        }

    try:
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        tool = {
            "name": "search_buildings",
            "description": (
                "Search NYC residential buildings by filters. "
                "Returns buildings matching criteria with health scores."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "borough": {
                        "type": "string",
                        "enum": ["MANHATTAN", "BRONX", "BROOKLYN", "QUEENS", "STATEN ISLAND"],
                    },
                    "neighborhood": {
                        "type": "string",
                        "description": "Community district code (e.g. '110' for Central Harlem)",
                    },
                    "min_score": {"type": "number", "minimum": 0, "maximum": 100},
                    "max_score": {"type": "number", "minimum": 0, "maximum": 100},
                    "complaint_types": {
                        "type": "array",
                        "items": {"type": "string", "enum": ["heat", "pest", "noise", "structural"]},
                    },
                    "min_units": {"type": "integer", "minimum": 1},
                    "max_units": {"type": "integer"},
                    "min_year_built": {"type": "integer"},
                    "max_year_built": {"type": "integer"},
                    "has_litigation": {"type": "boolean"},
                    "sort_by": {
                        "type": "string",
                        "enum": ["score_asc", "score_desc", "complaints", "violations"],
                    },
                },
            },
        }

        neighborhood_context = ", ".join(f"{k}={v}" for k, v in list(CD_NAMES.items())[:20])

        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=512,
            system=(
                "Translate NYC building search queries into structured filters. "
                "Use the search_buildings tool. "
                f"Neighborhood codes: {neighborhood_context}... "
                "For 'worst'/'unhealthy', use low max_score. "
                "For 'best'/'healthy', use high min_score. "
                "Always sort by score_asc for 'worst' queries."
            ),
            messages=[{"role": "user", "content": query}],
            tools=[tool],
        )

        filters = {}
        clarification = None
        for block in response.content:
            if block.type == "tool_use" and block.name == "search_buildings":
                filters = block.input
            elif block.type == "text" and block.text:
                clarification = block.text

        if not filters:
            return {
                "results": [],
                "total": 0,
                "query": query,
                "clarification": clarification or "Could not understand the search. Try rephrasing.",
            }

        filters = validate_filters(filters)
        results = await execute_search(db, filters)

        return {
            "results": results,
            "total": len(results),
            "query": query,
            "clarification": clarification or _describe_filters(filters),
        }

    except Exception as e:
        logger.error(f"Claude API search failed: {e}")
        return {
            "results": [],
            "total": 0,
            "query": query,
            "clarification": (
                "Could not understand the search query. "
                "Try keywords like borough names, neighborhood names, "
                "'rat', 'heat', 'noise', 'worst', 'best', 'pre-war', etc."
            ),
        }


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

    for key in ["min_units", "max_units"]:
        if key in filters and isinstance(filters[key], int):
            validated[key] = max(1, min(10000, filters[key]))

    for key in ["min_year_built", "max_year_built"]:
        if key in filters and isinstance(filters[key], int):
            validated[key] = max(1800, min(2030, filters[key]))

    if "building_class" in filters and isinstance(filters["building_class"], str):
        validated["building_class"] = filters["building_class"][:10]

    if "has_litigation" in filters and isinstance(filters["has_litigation"], bool):
        validated["has_litigation"] = filters["has_litigation"]

    if "sort_by" in filters and filters["sort_by"] in {
        "score_asc", "score_desc", "complaints", "violations"
    }:
        validated["sort_by"] = filters["sort_by"]

    return validated


async def execute_search(db: AsyncSession, filters: dict) -> list[dict]:
    """Execute validated search filters against the database."""
    conditions = []
    params: dict = {"limit": MAX_RESULTS}

    if "borough" in filters:
        conditions.append("b.borough = :borough")
        params["borough"] = filters["borough"]

    if "neighborhood" in filters:
        conditions.append("b.neighborhood ILIKE :neighborhood")
        params["neighborhood"] = f"%{filters['neighborhood']}%"

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

    if filters.get("complaint_types"):
        conditions.append("""
            EXISTS (
                SELECT 1 FROM complaints c
                WHERE c.bbl = b.bbl AND c.category = ANY(:complaint_types)
            )
        """)
        params["complaint_types"] = filters["complaint_types"]

    if "has_litigation" in filters:
        if filters["has_litigation"]:
            conditions.append("EXISTS (SELECT 1 FROM litigations l WHERE l.bbl = b.bbl)")
        else:
            conditions.append("NOT EXISTS (SELECT 1 FROM litigations l WHERE l.bbl = b.bbl)")

    # Build sort clause
    sort_map = {
        "score_asc": "hs.composite_score ASC NULLS LAST",
        "score_desc": "hs.composite_score DESC NULLS LAST",
        "complaints": "hs.total_complaints DESC NULLS LAST",
        "violations": "hs.total_violations DESC NULLS LAST",
    }
    order_by = sort_map.get(filters.get("sort_by", ""), "hs.composite_score ASC NULLS LAST")

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
