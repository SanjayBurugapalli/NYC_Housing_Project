"""Sub-neighborhood centroid data keyed by community district code.

Used to assign individual buildings to sub-neighborhoods within compound CDs,
enabling per-sub-neighborhood score computation.
"""

from typing import TypedDict


class SubNeighborhood(TypedDict):
    name: str
    lat: float
    lng: float


# Maps CD code (as stored in buildings.neighborhood) →
# list of sub-neighborhoods with approximate geographic centroids.
SUB_NEIGHBORHOOD_SPLITS: dict[str, list[SubNeighborhood]] = {
    # ── Manhattan ──────────────────────────────────────────────────────────────
    "101": [
        {"name": "Financial District", "lat": 40.7074, "lng": -74.0113},
        {"name": "Tribeca",            "lat": 40.7178, "lng": -74.0086},
    ],
    "102": [
        {"name": "Greenwich Village", "lat": 40.7337, "lng": -74.0027},
        {"name": "SoHo",              "lat": 40.7234, "lng": -74.0030},
    ],
    "103": [
        {"name": "Lower East Side", "lat": 40.7153, "lng": -73.9835},
        {"name": "Chinatown",       "lat": 40.7157, "lng": -73.9970},
    ],
    "104": [
        {"name": "Chelsea",        "lat": 40.7465, "lng": -74.0014},
        {"name": "Hell's Kitchen", "lat": 40.7638, "lng": -73.9920},
    ],
    "106": [
        {"name": "Stuyvesant Town", "lat": 40.7321, "lng": -73.9773},
        {"name": "Turtle Bay",      "lat": 40.7513, "lng": -73.9710},
    ],
    "109": [
        {"name": "Morningside Heights", "lat": 40.8076, "lng": -73.9617},
        {"name": "Hamilton Heights",    "lat": 40.8228, "lng": -73.9506},
    ],
    "112": [
        {"name": "Washington Heights", "lat": 40.8448, "lng": -73.9395},
        {"name": "Inwood",             "lat": 40.8674, "lng": -73.9210},
    ],

    # ── Bronx ──────────────────────────────────────────────────────────────────
    "201": [
        {"name": "Mott Haven", "lat": 40.8079, "lng": -73.9226},
        {"name": "Melrose",    "lat": 40.8183, "lng": -73.9179},
    ],
    "202": [
        {"name": "Hunts Point", "lat": 40.8144, "lng": -73.8875},
        {"name": "Longwood",    "lat": 40.8247, "lng": -73.8966},
    ],
    "203": [
        {"name": "Morrisania", "lat": 40.8343, "lng": -73.9067},
        {"name": "Crotona",    "lat": 40.8349, "lng": -73.8977},
    ],
    "204": [
        {"name": "Highbridge", "lat": 40.8355, "lng": -73.9230},
        {"name": "Concourse",  "lat": 40.8267, "lng": -73.9196},
    ],
    "205": [
        {"name": "Fordham",           "lat": 40.8604, "lng": -73.8990},
        {"name": "University Heights", "lat": 40.8506, "lng": -73.9107},
    ],
    "206": [
        {"name": "Belmont",      "lat": 40.8537, "lng": -73.8875},
        {"name": "East Tremont", "lat": 40.8459, "lng": -73.8934},
    ],
    "207": [
        {"name": "Kingsbridge", "lat": 40.8805, "lng": -73.9017},
        {"name": "Riverdale",   "lat": 40.9002, "lng": -73.9133},
    ],
    "209": [
        {"name": "Parkchester", "lat": 40.8418, "lng": -73.8601},
        {"name": "Soundview",   "lat": 40.8219, "lng": -73.8737},
    ],
    "210": [
        {"name": "Co-op City", "lat": 40.8760, "lng": -73.8313},
        {"name": "Pelham Bay", "lat": 40.8540, "lng": -73.8286},
    ],
    "211": [
        {"name": "Morris Park", "lat": 40.8511, "lng": -73.8585},
        {"name": "Bronxdale",   "lat": 40.8431, "lng": -73.8716},
    ],
    "228": [
        {"name": "Throgs Neck",  "lat": 40.8224, "lng": -73.8100},
        {"name": "Country Club", "lat": 40.8377, "lng": -73.7969},
    ],

    # ── Brooklyn ───────────────────────────────────────────────────────────────
    "301": [
        {"name": "Williamsburg", "lat": 40.7081, "lng": -73.9571},
        {"name": "Greenpoint",   "lat": 40.7291, "lng": -73.9513},
    ],
    "302": [
        {"name": "Fort Greene",      "lat": 40.6889, "lng": -73.9757},
        {"name": "Brooklyn Heights", "lat": 40.6958, "lng": -73.9939},
    ],
    "305": [
        {"name": "East New York",  "lat": 40.6584, "lng": -73.8822},
        {"name": "Starrett City",  "lat": 40.6487, "lng": -73.8708},
    ],
    "306": [
        {"name": "Park Slope",      "lat": 40.6710, "lng": -73.9804},
        {"name": "Carroll Gardens", "lat": 40.6797, "lng": -73.9989},
    ],
    "307": [
        {"name": "Sunset Park",     "lat": 40.6486, "lng": -74.0057},
        {"name": "Windsor Terrace", "lat": 40.6548, "lng": -73.9785},
    ],
    "309": [
        {"name": "Crown Heights South", "lat": 40.6619, "lng": -73.9437},
        {"name": "Prospect Lefferts",   "lat": 40.6560, "lng": -73.9528},
    ],
    "310": [
        {"name": "Bay Ridge",     "lat": 40.6346, "lng": -74.0196},
        {"name": "Dyker Heights", "lat": 40.6246, "lng": -74.0105},
    ],
    "311": [
        {"name": "Bensonhurst", "lat": 40.5992, "lng": -74.0050},
        {"name": "Bath Beach",  "lat": 40.6019, "lng": -74.0207},
    ],
    "312": [
        {"name": "Borough Park", "lat": 40.6262, "lng": -73.9912},
        {"name": "Kensington",   "lat": 40.6440, "lng": -73.9813},
    ],
    "313": [
        {"name": "Coney Island",   "lat": 40.5759, "lng": -73.9830},
        {"name": "Brighton Beach", "lat": 40.5776, "lng": -73.9614},
    ],
    "314": [
        {"name": "Flatbush", "lat": 40.6385, "lng": -73.9607},
        {"name": "Midwood",  "lat": 40.6195, "lng": -73.9608},
    ],
    "315": [
        {"name": "Sheepshead Bay",  "lat": 40.5922, "lng": -73.9482},
        {"name": "Gerritsen Beach", "lat": 40.5988, "lng": -73.9277},
    ],
    "316": [
        {"name": "Brownsville", "lat": 40.6628, "lng": -73.9103},
        {"name": "Ocean Hill",  "lat": 40.6787, "lng": -73.9133},
    ],
    "317": [
        {"name": "East Flatbush", "lat": 40.6442, "lng": -73.9393},
        {"name": "Rugby",         "lat": 40.6298, "lng": -73.9393},
    ],
    "318": [
        {"name": "Canarsie",  "lat": 40.6334, "lng": -73.9146},
        {"name": "Flatlands", "lat": 40.6275, "lng": -73.9321},
    ],

    # ── Queens ─────────────────────────────────────────────────────────────────
    "401": [
        {"name": "Astoria",          "lat": 40.7721, "lng": -73.9302},
        {"name": "Long Island City", "lat": 40.7447, "lng": -73.9485},
    ],
    "402": [
        {"name": "Woodside",  "lat": 40.7474, "lng": -73.9007},
        {"name": "Sunnyside", "lat": 40.7437, "lng": -73.9218},
    ],
    "403": [
        {"name": "Jackson Heights", "lat": 40.7559, "lng": -73.8836},
        {"name": "North Corona",    "lat": 40.7564, "lng": -73.8659},
    ],
    "404": [
        {"name": "Elmhurst",     "lat": 40.7368, "lng": -73.8820},
        {"name": "South Corona", "lat": 40.7483, "lng": -73.8659},
    ],
    "405": [
        {"name": "Ridgewood", "lat": 40.7038, "lng": -73.9038},
        {"name": "Glendale",  "lat": 40.6972, "lng": -73.8739},
        {"name": "Maspeth",   "lat": 40.7276, "lng": -73.9065},
    ],
    "406": [
        {"name": "Forest Hills", "lat": 40.7188, "lng": -73.8452},
        {"name": "Rego Park",    "lat": 40.7262, "lng": -73.8639},
    ],
    "407": [
        {"name": "Flushing",    "lat": 40.7675, "lng": -73.8330},
        {"name": "Bay Terrace", "lat": 40.7862, "lng": -73.7711},
    ],
    "408": [
        {"name": "Fresh Meadows", "lat": 40.7295, "lng": -73.7894},
        {"name": "Briarwood",     "lat": 40.7072, "lng": -73.8112},
    ],
    "409": [
        {"name": "Woodhaven",    "lat": 40.6914, "lng": -73.8568},
        {"name": "Richmond Hill", "lat": 40.6989, "lng": -73.8326},
    ],
    "410": [
        {"name": "Howard Beach", "lat": 40.6603, "lng": -73.8517},
        {"name": "Ozone Park",   "lat": 40.6775, "lng": -73.8436},
    ],
    "411": [
        {"name": "Bayside",     "lat": 40.7620, "lng": -73.7692},
        {"name": "Little Neck", "lat": 40.7685, "lng": -73.7369},
    ],
    "412": [
        {"name": "Jamaica", "lat": 40.6943, "lng": -73.7942},
        {"name": "Hollis",  "lat": 40.7103, "lng": -73.7706},
    ],
    "413": [
        {"name": "Queens Village", "lat": 40.7265, "lng": -73.7379},
        {"name": "Rosedale",       "lat": 40.6614, "lng": -73.7376},
    ],
    "414": [
        {"name": "Rockaway",      "lat": 40.5867, "lng": -73.8143},
        {"name": "Broad Channel", "lat": 40.6109, "lng": -73.8202},
    ],

    # ── Staten Island ──────────────────────────────────────────────────────────
    "501": [
        {"name": "St. George", "lat": 40.6434, "lng": -74.0735},
        {"name": "Stapleton",  "lat": 40.6269, "lng": -74.0745},
    ],
    "502": [
        {"name": "South Beach",  "lat": 40.5935, "lng": -74.0774},
        {"name": "Willowbrook",  "lat": 40.6019, "lng": -74.1142},
    ],
}
