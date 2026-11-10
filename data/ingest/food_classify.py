"""Classification + estimated price tiers for the "Food nearby" layer.

Pure functions (no I/O) so they're unit-testable — see
backend/tests/test_food_classify.py. pull_food.py applies them to:
  - NY State retail food store licenses → deli/corner store or grocery
  - DOHMH restaurant inspections        → restaurant

Price tiers are ESTIMATES (1 = $, 2 = $$, 3 = $$$). No free price-level source
is licensed for display on a Mapbox map (Google Places forbids non-Google maps;
Foursquare/Yelp prices are paid), so tiers come from store type, chain name and
cuisine. The UI labels them as estimates.
"""

import re

# ---------------------------------------------------------------------------
# Name normalization
# ---------------------------------------------------------------------------


def normalize_name(name: str | None) -> str:
    """Upper-case, drop apostrophes, turn punctuation/hyphens into spaces.

    "C-TOWN" → "C TOWN", "TRADER JOE'S" → "TRADER JOES", "D'AGOSTINO" → "DAGOSTINO".
    """
    s = (name or "").upper().replace("'", "").replace("’", "")
    s = re.sub(r"[^A-Z0-9&@ ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _has(name: str, fragment: str) -> bool:
    """Word-start match, so "TRADER JOE" hits "TRADER JOES" but "ALDI" misses "CALDI"."""
    return re.search(r"\b" + re.escape(fragment), name) is not None


def _first_match(name: str, table: list[tuple[str, int]]) -> int | None:
    for fragment, tier in table:
        if _has(name, fragment):
            return tier
    return None


# ---------------------------------------------------------------------------
# Delis & groceries (NY State retail food stores)
# ---------------------------------------------------------------------------

GROCERY_CHAINS: list[tuple[str, int]] = [
    # $ — discount and neighborhood supermarket chains
    ("ALDI", 1), ("LIDL", 1), ("C TOWN", 1), ("CTOWN", 1), ("KEY FOOD", 1),
    ("ASSOCIATED", 1), ("FOOD BAZAAR", 1), ("WESTERN BEEF", 1), ("BRAVO", 1),
    ("FINE FARE", 1), ("MET FOOD", 1), ("MET FRESH", 1), ("COMPARE", 1),
    ("PIONEER", 1), ("SHOPRITE", 1), ("SHOP RITE", 1), ("FOOD UNIVERSE", 1),
    ("FOOD DYNASTY", 1), ("SHOP FAIR", 1), ("IDEAL FOOD BASKET", 1),
    ("TRADE FAIR", 1), ("NET COST", 1), ("SUPERFRESH", 1), ("SUPER FRESH", 1),
    ("COSTCO", 1), ("BJS WHOLESALE", 1),
    # $$ — mid-priced chains
    ("TRADER JOE", 2), ("STOP & SHOP", 2), ("STOP AND SHOP", 2), ("FOODTOWN", 2),
    ("FOOD TOWN", 2), ("TARGET", 2), ("H MART", 2), ("HMART", 2), ("FAIRWAY", 2),
    ("WEGMANS", 2), ("FOOD EMPORIUM", 2),
    # $$$ — premium grocers
    ("WHOLE FOODS", 3), ("MORTON WILLIAMS", 3), ("WESTSIDE MARKET", 3),
    ("GRISTEDES", 3), ("DAGOSTINO", 3), ("CITARELLA", 3), ("EATALY", 3),
    ("AGATA", 3), ("ZABAR", 3), ("GARDEN OF EDEN", 3), ("BROOKLYN FARE", 3),
    ("UNION MARKET", 3), ("DEAN & DELUCA", 3), ("FORAGERS", 3),
]

# Licensed food retailers that aren't somewhere you'd go for a meal or groceries.
_STORE_EXCLUDE = [
    # pharmacies
    "CVS", "DUANE READE", "WALGREENS", "RITE AID", "PHARMACY", "DRUG",
    # dollar / discount variety
    "DOLLAR", "99 CENT", "99C", "MAX DEALS",
    # gas stations
    "BP", "MOBIL", "SHELL", "EXXON", "SUNOCO", "GULF", "CITGO", "SPEEDWAY",
    "GETTY", "VALERO", "HESS", "GAS", "FUEL", "AUTO",
    # snacks/specialty counters and kiosks
    "EDIBLE ARRANGEMENTS", "CHOCOLATE", "CANDY", "CONFECTION", "NUTS", "SUSHI",
    "VITAMIN", "GNC", "HUDSON NEWS", "NEWSSTAND", "TOBACCO", "SMOKE", "VAPE",
    "LIQUOR", "WINE", "SPIRITS", "PET",
]

_SUPERMARKET_WORDS = ["SUPERMARKET", "SUPER MARKET", "SUPERMERCADO"]
_PRODUCE_WORDS = ["PRODUCE", "FRUIT", "VEGETABLE", "FARM MARKET"]
_BUTCHER_WORDS = ["BUTCHER", "MEAT MARKET", "MEATS"]
_FISH_WORDS = ["FISH MARKET", "SEAFOOD MARKET"]
_DELI_WORDS = ["DELI", "BODEGA", "GRILL"]

# A store this big is a supermarket whatever it's called (Vital City's NYC
# grocery tracker uses the same 5,000 sq ft line).
SUPERMARKET_MIN_SQFT = 5000


def parse_square_footage(value: object) -> int | None:
    try:
        n = int(float(str(value).replace(",", "")))
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def classify_store(name: str | None, square_footage: object = None) -> tuple[str, str, int] | None:
    """(category, subtype, price_tier) for a NY State retail food store, or None to skip it."""
    n = normalize_name(name)
    if not n or "@" in n:  # "@" = a counter inside another store ("SUSHI@FAIRWAY")
        return None
    # Whole word (plural allowed): "BP" must not knock out "BPK DELI", nor
    # "GAS" a "GASTRO", but "CHOCOLATES" still counts as "CHOCOLATE".
    if any(re.search(r"\b" + re.escape(w) + r"S?\b", n) for w in _STORE_EXCLUDE):
        return None

    chain_tier = _first_match(n, GROCERY_CHAINS)
    if chain_tier is not None:
        return ("grocery", "Supermarket", chain_tier)
    if any(_has(n, w) for w in _PRODUCE_WORDS):
        return ("grocery", "Produce market", 1)
    if any(_has(n, w) for w in _BUTCHER_WORDS):
        return ("grocery", "Butcher", 1)
    if any(_has(n, w) for w in _FISH_WORDS):
        return ("grocery", "Fish market", 1)
    sqft = parse_square_footage(square_footage)
    if any(_has(n, w) for w in _SUPERMARKET_WORDS) or (sqft is not None and sqft >= SUPERMARKET_MIN_SQFT):
        return ("grocery", "Supermarket", 1)

    subtype = "Deli" if any(re.search(r"\b" + w + r"\b", n) for w in _DELI_WORDS) else "Corner store"
    return ("deli", subtype, 1)


# ---------------------------------------------------------------------------
# Restaurants (DOHMH)
# ---------------------------------------------------------------------------

FAST_FOOD_CHAINS = [
    "MCDONALD", "BURGER KING", "WENDY", "POPEYES", "KFC", "KENTUCKY FRIED",
    "SUBWAY", "DUNKIN", "TACO BELL", "WHITE CASTLE", "DOMINO", "PAPA JOHN",
    "PIZZA HUT", "LITTLE CAESAR", "SBARRO", "CHECKERS", "CHIPOTLE", "ARBYS",
    "NATHANS", "CROWN FRIED", "KENNEDY FRIED", "GOLDEN KRUST", "CHICK FIL A",
    "PANDA EXPRESS", "FIVE GUYS", "SHAKE SHACK", "STARBUCKS", "PRET A MANGER",
    "JOLLIBEE", "WINGSTOP", "QDOBA", "JAMBA", "BASKIN", "CARVEL", "DAIRY QUEEN",
    "HALAL GUYS", "TIM HORTONS", "7 ELEVEN",
]

# DOHMH cuisine_description → display subtype (only where the raw value is clunky).
_CUISINE_DISPLAY = {
    "Bakery Products/Desserts": "Bakery",
    "Bagels/Pretzels": "Bagels",
    "Coffee/Tea": "Coffee & tea",
    "Juice, Smoothies, Fruit Salads": "Juice & smoothies",
    "Sandwiches/Salads/Mixed Buffet": "Sandwiches & salads",
    "Soups/Salads/Sandwiches": "Soups & sandwiches",
    "Hotdogs/Pretzels": "Hot dogs",
    "Hotdogs": "Hot dogs",
    "Asian/Asian Fusion": "Asian",
    "Jewish/Kosher": "Kosher",
    "Nuts/Confectionary": "Sweets",
    "Frozen Desserts": "Frozen desserts",
    "Bottled Beverages": "Drinks",
    "Fruits/Vegetables": "Produce",
    "Pancakes/Waffles": "Pancakes & waffles",
    "Creole/Cajun": "Creole & Cajun",
}

# Cuisines that mean "no cuisine recorded" (new, not-yet-inspected places).
_NO_CUISINE = {"", "Not Listed/Not Applicable"}

_CHEAP_CUISINES = {
    "Pizza", "Chicken", "Hamburgers", "Sandwiches", "Sandwiches/Salads/Mixed Buffet",
    "Soups/Salads/Sandwiches", "Bagels/Pretzels", "Donuts", "Coffee/Tea",
    "Juice, Smoothies, Fruit Salads", "Hotdogs", "Hotdogs/Pretzels",
    "Frozen Desserts", "Bakery Products/Desserts", "Latin American", "Caribbean",
    "Mexican", "Tex-Mex", "Chinese", "Bottled Beverages", "Nuts/Confectionary",
    "Fruits/Vegetables",
}
_PRICEY_CUISINES = {"Steakhouse", "French", "New French", "Continental", "Haute Cuisine"}


# DOHMH permits every food-service kitchen, not just places you can walk into:
# office pantries, school and hospital cafeterias, caterers, banquet halls.
# These name patterns mark kitchens that aren't open to the public. A bare
# "CAFETERIA" is deliberately NOT here — plenty of public spots use it.
_NON_PUBLIC_PATTERNS = [
    # "EMPLOYEES ONLY" is a public bar, so employee/staff need a kitchen word
    r"\b(EMPLOYEES?|STAFF) (CAFETERIA|CAFE|DINING|KITCHEN|PANTRY|LOUNGE)\b",
    r"\bFACULTY\b", r"\bEXECUTIVE DINING\b", r"\bDINING HALL\b",
    r"\bSCHOOL\b", r"\bCOLLEGE\b", r"\bUNIVERSITY\b",
    r"\bHOSPITAL\b", r"\bMEDICAL CENTER\b", r"\bNURSING\b", r"\bREHAB(ILITATION)?\b",
    r"\bSENIOR CENTER\b", r"\bDAY ?CARE\b", r"\bCHURCH\b", r"\bSYNAGOGUE\b",
    # public school numbers: "P.S. 41", "IS 318", "J.H.S. 22"
    r"\b(P ?S|I ?S|M ?S|J ?H ?S|H ?S)\s?\d{1,3}\b",
]


# Caterers and banquet halls — unless the name also says it's a sit-down place
# ("MABLE'S SMOKEHOUSE & BANQUET HALL", "FLAM'S CUISINE & CATERING").
_EVENT_PATTERN = r"\b(CATERING|CATERERS?|CATERS|BANQUETS?)\b"
_RESTAURANT_WORDS = (
    r"\b(RESTAURANT|CUISINE|BISTRO|SMOKEHOUSE|GRILL|CAFE|PIZZA|PIZZERIA|DELI|BBQ|BAR|LOUNGE|"
    r"TAQUERIA|BAKERY|DINER|SOUL ?FOOD)\b"
)


def is_non_public_kitchen(name: str | None) -> bool:
    """True for school/office/hospital cafeterias, caterers and banquet kitchens."""
    n = normalize_name(name)
    if any(re.search(p, n) for p in _NON_PUBLIC_PATTERNS):
        return True
    return re.search(_EVENT_PATTERN, n) is not None and re.search(_RESTAURANT_WORDS, n) is None


def never_inspected(last_inspection: str | None) -> bool:
    """DOHMH dates permitted-but-never-inspected places 1900-01-01.

    These have no cuisine on file and are disproportionately office pantries and
    institutional kitchens ("NETFLIX", "XAVIER HIGH SCHOOL"); a real new
    restaurant shows up after its first inspection.
    """
    return not last_inspection or last_inspection.startswith("1900")


def clean_cuisine(cuisine: str | None) -> str | None:
    c = (cuisine or "").strip()
    if c in _NO_CUISINE:
        return None
    return _CUISINE_DISPLAY.get(c, c)


def restaurant_price_tier(name: str | None, cuisine: str | None) -> int | None:
    """$ for fast-food chains and cheap-eats cuisines, $$$ for steak/French, else $$."""
    if any(_has(normalize_name(name), chain) for chain in FAST_FOOD_CHAINS):
        return 1
    c = (cuisine or "").strip()
    if c in _NO_CUISINE:
        return None
    if c in _CHEAP_CUISINES:
        return 1
    if c in _PRICEY_CUISINES:
        return 3
    return 2


def title_name(name: str | None) -> str:
    """"JOE'S PIZZA & DELI" → "Joe's Pizza & Deli" (keeps short all-caps like "BBQ")."""
    words = []
    for w in (name or "").strip().split():
        if len(w) <= 3 and w.isalpha() and w.upper() in {"BBQ", "NYC", "USA", "II", "III"}:
            words.append(w.upper())
        else:
            words.append(w[:1].upper() + w[1:].lower())
    return re.sub(r"\s+", " ", " ".join(words))
