# NYC Community District code → neighborhood name mapping
NEIGHBORHOOD_NAMES: dict[str, str] = {
    # Manhattan
    "101": "Financial District/Tribeca",
    "102": "Greenwich Village/SoHo",
    "103": "Lower East Side/Chinatown",
    "104": "Chelsea/Hell's Kitchen",
    "105": "Midtown",
    "106": "Stuyvesant Town/Turtle Bay",
    "107": "Upper West Side",
    "108": "Upper East Side",
    "109": "Morningside Heights/Hamilton Heights",
    "110": "Central Harlem",
    "111": "East Harlem",
    "112": "Washington Heights/Inwood",
    "208": "Governors Island",
    # Bronx
    "201": "Mott Haven/Melrose",
    "202": "Hunts Point/Longwood",
    "203": "Morrisania/Crotona",
    "204": "Highbridge/Concourse",
    "205": "Fordham/University Heights",
    "206": "Belmont/East Tremont",
    "207": "Kingsbridge/Riverdale",
    "209": "Parkchester/Soundview",
    "210": "Co-op City/Pelham Bay",
    "211": "Morris Park/Bronxdale",
    "212": "Williamsbridge/Baychester",
    "228": "Throgs Neck/Country Club",
    # Brooklyn
    "301": "Williamsburg/Greenpoint",
    "302": "Fort Greene/Brooklyn Heights",
    "303": "Bedford-Stuyvesant",
    "304": "Bushwick",
    "305": "East New York/Starrett City",
    "306": "Park Slope/Carroll Gardens",
    "307": "Sunset Park/Windsor Terrace",
    "308": "Crown Heights North",
    "309": "Crown Heights South/Prospect Lefferts",
    "310": "Bay Ridge/Dyker Heights",
    "311": "Bensonhurst/Bath Beach",
    "312": "Borough Park/Kensington",
    "313": "Coney Island/Brighton Beach",
    "314": "Flatbush/Midwood",
    "315": "Sheepshead Bay/Gerritsen Beach",
    "316": "Brownsville/Ocean Hill",
    "317": "East Flatbush/Rugby",
    "318": "Canarsie/Flatlands",
    # Queens
    "401": "Astoria/Long Island City",
    "402": "Woodside/Sunnyside",
    "403": "Jackson Heights/North Corona",
    "404": "Elmhurst/South Corona",
    "405": "Ridgewood/Glendale/Maspeth",
    "406": "Forest Hills/Rego Park",
    "407": "Flushing/Bay Terrace",
    "408": "Fresh Meadows/Briarwood",
    "409": "Woodhaven/Richmond Hill",
    "410": "Howard Beach/Ozone Park",
    "411": "Bayside/Little Neck",
    "412": "Jamaica/Hollis",
    "413": "Queens Village/Rosedale",
    "414": "Rockaway/Broad Channel",
    "484": "JFK Airport Area",
    # Staten Island
    "501": "St. George/Stapleton",
    "502": "South Beach/Willowbrook",
    "503": "Tottenville/Great Kills",
}


def get_neighborhood_name(code: str, borough: str) -> str:
    """Convert community district code to readable neighborhood name."""
    # Code format in DB is like "112-MANHATTAN", extract the number
    district = code.split("-")[0] if "-" in code else code
    name = NEIGHBORHOOD_NAMES.get(district)
    if name:
        return name
    return f"District {district}"
