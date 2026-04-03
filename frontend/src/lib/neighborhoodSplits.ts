/** Sub-neighborhood centroids for splitting compound neighborhood bubbles at zoom ≥ 11. */

export interface SubNeighborhood {
  name: string;
  lat: number;
  lng: number;
}

/**
 * Maps a compound neighborhood name (as returned by the API) to its
 * component sub-neighborhoods with approximate geographic centroids.
 * Used in Map.tsx to split combined bubbles into individual ones at higher zoom.
 */
export const NEIGHBORHOOD_SPLITS: Record<string, SubNeighborhood[]> = {
  // ── Manhattan ──────────────────────────────────────────────────────────────
  "Financial District/Tribeca": [
    { name: "Financial District", lat: 40.7074, lng: -74.0113 },
    { name: "Tribeca",            lat: 40.7178, lng: -74.0086 },
  ],
  "Greenwich Village/SoHo": [
    { name: "Greenwich Village", lat: 40.7337, lng: -74.0027 },
    { name: "SoHo",              lat: 40.7234, lng: -74.0030 },
  ],
  "Lower East Side/Chinatown": [
    { name: "Lower East Side", lat: 40.7153, lng: -73.9835 },
    { name: "Chinatown",       lat: 40.7157, lng: -73.9970 },
  ],
  "Chelsea/Hell's Kitchen": [
    { name: "Chelsea",        lat: 40.7465, lng: -74.0014 },
    { name: "Hell's Kitchen", lat: 40.7638, lng: -73.9920 },
  ],
  "Stuyvesant Town/Turtle Bay": [
    { name: "Stuyvesant Town", lat: 40.7321, lng: -73.9773 },
    { name: "Turtle Bay",      lat: 40.7513, lng: -73.9710 },
  ],
  "Morningside Heights/Hamilton Heights": [
    { name: "Morningside Heights", lat: 40.8076, lng: -73.9617 },
    { name: "Hamilton Heights",    lat: 40.8228, lng: -73.9506 },
  ],
  "Washington Heights/Inwood": [
    { name: "Washington Heights", lat: 40.8448, lng: -73.9395 },
    { name: "Inwood",             lat: 40.8674, lng: -73.9210 },
  ],

  // ── Bronx ──────────────────────────────────────────────────────────────────
  "Mott Haven/Melrose": [
    { name: "Mott Haven", lat: 40.8079, lng: -73.9226 },
    { name: "Melrose",    lat: 40.8183, lng: -73.9179 },
  ],
  "Hunts Point/Longwood": [
    { name: "Hunts Point", lat: 40.8144, lng: -73.8875 },
    { name: "Longwood",    lat: 40.8247, lng: -73.8966 },
  ],
  "Morrisania/Crotona": [
    { name: "Morrisania", lat: 40.8343, lng: -73.9067 },
    { name: "Crotona",    lat: 40.8349, lng: -73.8977 },
  ],
  "Highbridge/Concourse": [
    { name: "Highbridge", lat: 40.8355, lng: -73.9230 },
    { name: "Concourse",  lat: 40.8267, lng: -73.9196 },
  ],
  "Fordham/University Heights": [
    { name: "Fordham",          lat: 40.8604, lng: -73.8990 },
    { name: "University Heights", lat: 40.8506, lng: -73.9107 },
  ],
  "Belmont/East Tremont": [
    { name: "Belmont",      lat: 40.8537, lng: -73.8875 },
    { name: "East Tremont", lat: 40.8459, lng: -73.8934 },
  ],
  "Kingsbridge/Riverdale": [
    { name: "Kingsbridge", lat: 40.8805, lng: -73.9017 },
    { name: "Riverdale",   lat: 40.9002, lng: -73.9133 },
  ],
  "Co-op City/Pelham Bay": [
    { name: "Co-op City", lat: 40.8760, lng: -73.8313 },
    { name: "Pelham Bay", lat: 40.8540, lng: -73.8286 },
  ],
  "Morris Park/Bronxdale": [
    { name: "Morris Park", lat: 40.8511, lng: -73.8585 },
    { name: "Bronxdale",   lat: 40.8431, lng: -73.8716 },
  ],
  "Parkchester/Soundview": [
    { name: "Parkchester", lat: 40.8418, lng: -73.8601 },
    { name: "Soundview",   lat: 40.8219, lng: -73.8737 },
  ],
  "Throgs Neck/Country Club": [
    { name: "Throgs Neck",  lat: 40.8224, lng: -73.8100 },
    { name: "Country Club", lat: 40.8377, lng: -73.7969 },
  ],

  // ── Brooklyn ───────────────────────────────────────────────────────────────
  "Williamsburg/Greenpoint": [
    { name: "Williamsburg", lat: 40.7081, lng: -73.9571 },
    { name: "Greenpoint",   lat: 40.7291, lng: -73.9513 },
  ],
  "Fort Greene/Brooklyn Heights": [
    { name: "Fort Greene",      lat: 40.6889, lng: -73.9757 },
    { name: "Brooklyn Heights", lat: 40.6958, lng: -73.9939 },
  ],
  "East New York/Starrett City": [
    { name: "East New York",  lat: 40.6584, lng: -73.8822 },
    { name: "Starrett City",  lat: 40.6487, lng: -73.8708 },
  ],
  "Park Slope/Carroll Gardens": [
    { name: "Park Slope",      lat: 40.6710, lng: -73.9804 },
    { name: "Carroll Gardens", lat: 40.6797, lng: -73.9989 },
  ],
  "Sunset Park/Windsor Terrace": [
    { name: "Sunset Park",     lat: 40.6486, lng: -74.0057 },
    { name: "Windsor Terrace", lat: 40.6548, lng: -73.9785 },
  ],
  "Crown Heights South/Prospect Lefferts": [
    { name: "Crown Heights South", lat: 40.6619, lng: -73.9437 },
    { name: "Prospect Lefferts",   lat: 40.6560, lng: -73.9528 },
  ],
  "Bay Ridge/Dyker Heights": [
    { name: "Bay Ridge",     lat: 40.6346, lng: -74.0196 },
    { name: "Dyker Heights", lat: 40.6246, lng: -74.0105 },
  ],
  "Bensonhurst/Bath Beach": [
    { name: "Bensonhurst", lat: 40.5992, lng: -74.0050 },
    { name: "Bath Beach",  lat: 40.6019, lng: -74.0207 },
  ],
  "Borough Park/Kensington": [
    { name: "Borough Park", lat: 40.6262, lng: -73.9912 },
    { name: "Kensington",   lat: 40.6440, lng: -73.9813 },
  ],
  "Coney Island/Brighton Beach": [
    { name: "Coney Island",   lat: 40.5759, lng: -73.9830 },
    { name: "Brighton Beach", lat: 40.5776, lng: -73.9614 },
  ],
  "Sheepshead Bay/Gerritsen Beach": [
    { name: "Sheepshead Bay",  lat: 40.5922, lng: -73.9482 },
    { name: "Gerritsen Beach", lat: 40.5988, lng: -73.9277 },
  ],
  "Brownsville/Ocean Hill": [
    { name: "Brownsville", lat: 40.6628, lng: -73.9103 },
    { name: "Ocean Hill",  lat: 40.6787, lng: -73.9133 },
  ],
  "East Flatbush/Rugby": [
    { name: "East Flatbush", lat: 40.6442, lng: -73.9393 },
    { name: "Rugby",         lat: 40.6298, lng: -73.9393 },
  ],
  "Flatbush/Midwood": [
    { name: "Flatbush", lat: 40.6385, lng: -73.9607 },
    { name: "Midwood",  lat: 40.6195, lng: -73.9608 },
  ],
  "Canarsie/Flatlands": [
    { name: "Canarsie",  lat: 40.6334, lng: -73.9146 },
    { name: "Flatlands", lat: 40.6275, lng: -73.9321 },
  ],

  // ── Queens ─────────────────────────────────────────────────────────────────
  "Astoria/Long Island City": [
    { name: "Astoria",          lat: 40.7721, lng: -73.9302 },
    { name: "Long Island City", lat: 40.7447, lng: -73.9485 },
  ],
  "Woodside/Sunnyside": [
    { name: "Woodside",  lat: 40.7474, lng: -73.9007 },
    { name: "Sunnyside", lat: 40.7437, lng: -73.9218 },
  ],
  "Jackson Heights/North Corona": [
    { name: "Jackson Heights", lat: 40.7559, lng: -73.8836 },
    { name: "North Corona",    lat: 40.7564, lng: -73.8659 },
  ],
  "Elmhurst/South Corona": [
    { name: "Elmhurst",     lat: 40.7368, lng: -73.8820 },
    { name: "South Corona", lat: 40.7483, lng: -73.8659 },
  ],
  "Ridgewood/Glendale/Maspeth": [
    { name: "Ridgewood", lat: 40.7038, lng: -73.9038 },
    { name: "Glendale",  lat: 40.6972, lng: -73.8739 },
    { name: "Maspeth",   lat: 40.7276, lng: -73.9065 },
  ],
  "Forest Hills/Rego Park": [
    { name: "Forest Hills", lat: 40.7188, lng: -73.8452 },
    { name: "Rego Park",    lat: 40.7262, lng: -73.8639 },
  ],
  "Flushing/Bay Terrace": [
    { name: "Flushing",    lat: 40.7675, lng: -73.8330 },
    { name: "Bay Terrace", lat: 40.7862, lng: -73.7711 },
  ],
  "Fresh Meadows/Briarwood": [
    { name: "Fresh Meadows", lat: 40.7295, lng: -73.7894 },
    { name: "Briarwood",     lat: 40.7072, lng: -73.8112 },
  ],
  "Woodhaven/Richmond Hill": [
    { name: "Woodhaven",    lat: 40.6914, lng: -73.8568 },
    { name: "Richmond Hill", lat: 40.6989, lng: -73.8326 },
  ],
  "Howard Beach/Ozone Park": [
    { name: "Howard Beach", lat: 40.6603, lng: -73.8517 },
    { name: "Ozone Park",   lat: 40.6775, lng: -73.8436 },
  ],
  "Bayside/Little Neck": [
    { name: "Bayside",    lat: 40.7620, lng: -73.7692 },
    { name: "Little Neck", lat: 40.7685, lng: -73.7369 },
  ],
  "Jamaica/Hollis": [
    { name: "Jamaica", lat: 40.6943, lng: -73.7942 },
    { name: "Hollis",  lat: 40.7103, lng: -73.7706 },
  ],
  "Queens Village/Rosedale": [
    { name: "Queens Village", lat: 40.7265, lng: -73.7379 },
    { name: "Rosedale",       lat: 40.6614, lng: -73.7376 },
  ],
  "Rockaway/Broad Channel": [
    { name: "Rockaway",      lat: 40.5867, lng: -73.8143 },
    { name: "Broad Channel", lat: 40.6109, lng: -73.8202 },
  ],

  // ── Staten Island ──────────────────────────────────────────────────────────
  "St. George/Stapleton": [
    { name: "St. George", lat: 40.6434, lng: -74.0735 },
    { name: "Stapleton",  lat: 40.6269, lng: -74.0745 },
  ],
  "South Beach/Willowbrook": [
    { name: "South Beach",  lat: 40.5935, lng: -74.0774 },
    { name: "Willowbrook",  lat: 40.6019, lng: -74.1142 },
  ],
};
