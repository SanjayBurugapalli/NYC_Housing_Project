"""Download NYC NTA 2020 neighborhood boundaries and spatially join to buildings.

Creates an `nta_boundaries` PostGIS table and populates `buildings.nta_name`
via ST_Within spatial join. Replaces the CD-code based `neighborhood` label
with accurate popular neighborhood names (East Village, Gramercy, etc.).
"""

import json
import logging
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent))
from base import get_db_engine

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

SOCRATA_URL = "https://data.cityofnewyork.us/resource/9nt8-h7nd.json"

# Shorten names that are too long for display (>35 chars typically).
# Keys are the official NTA names; values are our display names.
NTA_NAME_OVERRIDES: dict[str, str] = {
    # Queens
    "Breezy Point-Belle Harbor-Rockaway Park-Broad Channel": "Rockaway Peninsula",
    "Glen Oaks-Floral Park-New Hyde Park": "Glen Oaks-Floral Park",
    "Queensbridge-Ravenswood-Dutch Kills": "Queensbridge-Ravenswood",
    "Springfield Gardens (North)-Rochdale Village": "Springfield Gardens North",
    "Springfield Gardens (South)-Brookville": "Springfield Gardens South",
    "Pomonok-Electchester-Hillcrest": "Hillcrest-Pomonok",
    "Long Island City-Hunters Point": "Long Island City",
    # Brooklyn
    "Carroll Gardens-Cobble Hill-Gowanus-Red Hook": "Carroll Gardens-Cobble Hill-Red Hook",
    "Sheepshead Bay-Manhattan Beach-Gerritsen Beach": "Sheepshead Bay-Manhattan Beach",
    "Downtown Brooklyn-DUMBO-Boerum Hill": "DUMBO-Boerum Hill",
    "Flatbush (West)-Ditmas Park-Parkville": "Ditmas Park-Flatbush West",
    "Sunset Park (East)-Borough Park (West)": "Sunset Park East",
    "Marine Park-Mill Basin-Bergen Beach": "Marine Park-Mill Basin",
    "Prospect Lefferts Gardens-Wingate": "Prospect Lefferts Gardens",
    "East Flatbush-Remsen Village": "East Flatbush-Remsen Village",  # 28 chars, keep
    # Manhattan
    "Midtown South-Flatiron-Union Square": "Flatiron-Union Square",
    "Upper East Side-Lenox Hill-Roosevelt Island": "Lenox Hill-Roosevelt Island",
    "Stuyvesant Town-Peter Cooper Village": "Stuyvesant Town",
    "SoHo-Little Italy-Hudson Square": "SoHo-Little Italy",
    "Tribeca-Civic Center": "Tribeca",
    "Financial District-Battery Park City": "Financial District",
    "Chelsea-Hudson Yards": "Chelsea",
    "Chinatown-Two Bridges": "Chinatown",
    # Bronx
    "Kingsbridge Heights-Van Cortlandt Village": "Kingsbridge Heights",
    "University Heights (South)-Morris Heights": "Morris Heights",
    "University Heights (North)-Fordham": "University Heights-Fordham",
    "Claremont Village-Claremont (East)": "Claremont Village",
    "Mount Eden-Claremont (West)": "Mount Eden",
    "Pelham Bay-Country Club-City Island": "Pelham Bay-City Island",
    "Soundview-Bruckner-Bronx River": "Soundview",
    "Soundview-Clason Point": "Soundview-Clason Point",  # 22 chars, keep
    "Eastchester-Edenwald-Baychester": "Eastchester-Baychester",
    "Mott Haven-Port Morris": "Mott Haven",
    "Pelham Parkway-Van Nest": "Pelham Parkway",
    "Concourse-Concourse Village": "Concourse Village",
    "Williamsbridge-Olinville": "Williamsbridge",
    "Throgs Neck-Schuylerville": "Throgs Neck",
    "Kingsbridge-Marble Hill": "Kingsbridge",
    # Staten Island
    "Todt Hill-Emerson Hill-Lighthouse Hill-Manor Heights": "Todt Hill-Emerson Hill",
    "Tompkinsville-Stapleton-Clifton-Fox Hills": "Stapleton-Clifton",
    "Grasmere-Arrochar-South Beach-Dongan Hills": "Arrochar-South Beach",
    "New Springville-Willowbrook-Bulls Head-Travis": "New Springville-Willowbrook",
    "West New Brighton-Silver Lake-Grymes Hill": "West New Brighton-Grymes Hill",
    "Mariner's Harbor-Arlington-Graniteville": "Mariner's Harbor",
    "Annadale-Huguenot-Prince's Bay-Woodrow": "Prince's Bay-Annadale",
    "Rosebank-Shore Acres-Park Hill": "Rosebank-Shore Acres",
    "Great Kills-Eltingville": "Great Kills",
    "Arden Heights-Rossville": "Arden Heights",
    "St. George-New Brighton": "St. George",
    "Tottenville-Charleston": "Tottenville",
    "Westerleigh-Castleton Corners": "Westerleigh",
    "Oakwood-Richmondtown": "Oakwood-Richmond Town",
    "New Dorp-Midland Beach": "New Dorp",
    "Howard Beach-Lindenwood": "Howard Beach",
}


def fetch_ntas() -> list[dict]:
    """Fetch all residential NTA records with geometry from NYC Open Data."""
    params = urllib.parse.urlencode({
        "$limit": 500,
        "$where": "ntatype='0'",
        "$select": "nta2020,ntaname,boroname,the_geom",
    })
    url = f"{SOCRATA_URL}?{params}"
    logger.info("Fetching NTA boundaries from %s", url)
    with urllib.request.urlopen(url, timeout=60) as r:
        data = json.loads(r.read())
    logger.info("Fetched %d NTA records", len(data))
    return data


def apply_overrides(name: str) -> str:
    return NTA_NAME_OVERRIDES.get(name, name)


def create_table(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS nta_boundaries"))
        conn.execute(text("""
            CREATE TABLE nta_boundaries (
                nta_code   VARCHAR(20) PRIMARY KEY,
                nta_name   VARCHAR(120) NOT NULL,
                borough    VARCHAR(50),
                geom       GEOMETRY(MULTIPOLYGON, 4326)
            )
        """))
        conn.execute(text(
            "CREATE INDEX idx_nta_boundaries_geom ON nta_boundaries USING GIST(geom)"
        ))
    logger.info("Created nta_boundaries table")


def insert_ntas(engine, rows: list[dict]) -> None:
    inserted = 0
    with engine.begin() as conn:
        for row in rows:
            geom = row.get("the_geom")
            if not geom:
                continue
            geom_json = json.dumps(geom)
            nta_code = row["nta2020"]
            nta_name = apply_overrides(row["ntaname"])
            borough = row.get("boroname", "")
            conn.execute(text("""
                INSERT INTO nta_boundaries (nta_code, nta_name, borough, geom)
                VALUES (:code, :name, :borough, ST_GeomFromGeoJSON(:geom))
            """), {"code": nta_code, "name": nta_name, "borough": borough, "geom": geom_json})
            inserted += 1
    logger.info("Inserted %d NTA boundaries", inserted)


def add_buildings_columns(engine) -> None:
    with engine.begin() as conn:
        for col, typ in [("nta_code", "VARCHAR(20)"), ("nta_name", "VARCHAR(120)")]:
            try:
                conn.execute(text(f"ALTER TABLE buildings ADD COLUMN {col} {typ}"))
                logger.info("Added column buildings.%s", col)
            except Exception:
                logger.info("Column buildings.%s already exists, skipping", col)


def run_spatial_join(engine) -> None:
    logger.info("Running spatial join — this may take a few minutes...")
    with engine.begin() as conn:
        result = conn.execute(text("""
            UPDATE buildings b
            SET nta_code = n.nta_code,
                nta_name = n.nta_name
            FROM nta_boundaries n
            WHERE ST_Within(b.geom, n.geom)
        """))
        updated = result.rowcount
    logger.info("Spatially joined %d buildings to NTAs", updated)

    # Report how many buildings got no NTA match (e.g., on exact boundary)
    with engine.connect() as conn:
        row = conn.execute(text(
            "SELECT COUNT(*) FROM buildings WHERE nta_name IS NULL AND geom IS NOT NULL"
        )).fetchone()
        unmatched = row[0] if row else 0
    if unmatched:
        logger.warning("%d buildings with geometry have no NTA match — trying ST_DWithin fallback", unmatched)
        _fallback_nearest(engine)


def _fallback_nearest(engine) -> None:
    """Assign the nearest NTA to any buildings that fell outside all NTA polygons."""
    with engine.begin() as conn:
        result = conn.execute(text("""
            UPDATE buildings
            SET nta_code = nearest.nta_code,
                nta_name = nearest.nta_name
            FROM (
                SELECT b.bbl, n.nta_code, n.nta_name
                FROM buildings b
                CROSS JOIN LATERAL (
                    SELECT nta_code, nta_name
                    FROM nta_boundaries
                    ORDER BY geom <-> b.geom
                    LIMIT 1
                ) n
                WHERE b.nta_name IS NULL AND b.geom IS NOT NULL
            ) nearest
            WHERE buildings.bbl = nearest.bbl
        """))
        logger.info("Fallback nearest-NTA assigned to %d buildings", result.rowcount)


def create_index(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_buildings_nta_name ON buildings(nta_name)"
        ))
    logger.info("Created index on buildings.nta_name")


def print_sample(engine) -> None:
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT nta_name, COUNT(*) as cnt
            FROM buildings
            WHERE nta_name IS NOT NULL
            GROUP BY nta_name
            ORDER BY cnt DESC
            LIMIT 20
        """)).fetchall()
    print("\nTop 20 NTAs by building count:")
    for name, cnt in rows:
        print(f"  {cnt:6d}  {name}")


def main() -> None:
    engine = get_db_engine()
    rows = fetch_ntas()
    create_table(engine)
    insert_ntas(engine, rows)
    add_buildings_columns(engine)
    run_spatial_join(engine)
    create_index(engine)
    print_sample(engine)
    logger.info("Done.")


if __name__ == "__main__":
    main()
