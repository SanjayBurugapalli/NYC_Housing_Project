"""Pull PLUTO dataset — master building universe.

Socrata endpoint: 64uk-42ks
Join key: BBL
"""

import logging
import pandas as pd
from sqlalchemy import text

from base import paginate_socrata, get_db_engine, normalize_borough

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

ENDPOINT = "64uk-42ks"


def pull_pluto(limit: int | None = None):
    """Pull PLUTO data and upsert into buildings table."""
    engine = get_db_engine()

    select = (
        "bbl,borough,block,lot,address,zipcode,"
        "unitsres,unitstotal,yearbuilt,yearalter1,"
        "bldgclass,landuse,numfloors,lotarea,bldgarea,"
        "ownername,latitude,longitude,cd"
    )

    total_inserted = 0
    for results in paginate_socrata(
        ENDPOINT, select=select, where="unitsres > 0", limit=limit
    ):
        df = transform_pluto(pd.DataFrame(results))

        records = [row.to_dict() for _, row in df.iterrows()]
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO buildings (
                        bbl, bin, house_number, street_name, borough, zipcode,
                        address, residential_units, total_units, year_built,
                        year_altered, building_class, land_use, num_floors,
                        lot_area, building_area, owner_name, latitude, longitude,
                        geom, neighborhood
                    ) VALUES (
                        :bbl, :bin, :house_number, :street_name, :borough, :zipcode,
                        :address, :residential_units, :total_units, :year_built,
                        :year_altered, :building_class, :land_use, :num_floors,
                        :lot_area, :building_area, :owner_name, :latitude, :longitude,
                        ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326),
                        :neighborhood
                    ) ON CONFLICT (bbl) DO UPDATE SET
                        bin = EXCLUDED.bin,
                        address = EXCLUDED.address,
                        residential_units = EXCLUDED.residential_units,
                        total_units = EXCLUDED.total_units,
                        year_built = EXCLUDED.year_built,
                        building_class = EXCLUDED.building_class,
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        geom = EXCLUDED.geom,
                        owner_name = EXCLUDED.owner_name,
                        updated_at = NOW()
                """),
                records,
            )

        total_inserted += len(df)
        logger.info(f"Upserted {total_inserted} buildings so far")

    logger.info(f"PLUTO ingestion complete. Total: {total_inserted} buildings")
    return total_inserted


def transform_pluto(df: pd.DataFrame) -> pd.DataFrame:
    """Transform raw PLUTO data for insertion."""
    rename_map = {
        "unitsres": "residential_units",
        "unitstotal": "total_units",
        "yearbuilt": "year_built",
        "yearalter1": "year_altered",
        "bldgclass": "building_class",
        "landuse": "land_use",
        "numfloors": "num_floors",
        "lotarea": "lot_area",
        "bldgarea": "building_area",
        "ownername": "owner_name",
        "cd": "neighborhood",
    }
    df = df.rename(columns=rename_map)

    # Parse numeric fields
    for col in ["residential_units", "total_units", "year_built", "year_altered"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

    for col in ["num_floors", "lot_area", "building_area", "latitude", "longitude"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Normalize borough
    df["borough"] = df["borough"].apply(normalize_borough)

    # Extract address parts
    if "address" in df.columns:
        parts = df["address"].str.split(" ", n=1, expand=True)
        df["house_number"] = parts[0] if 0 in parts.columns else None
        df["street_name"] = parts[1] if 1 in parts.columns else None

    # Ensure BBL is 10 digits (Socrata returns as float string like "1000050010.00000000")
    df["bbl"] = pd.to_numeric(df["bbl"], errors="coerce").fillna(0).astype(int).astype(str).str.zfill(10)

    # BIN is not in PLUTO — set to None
    if "bin" not in df.columns:
        df["bin"] = None

    return df


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Pull PLUTO dataset")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of records")
    args = parser.parse_args()
    pull_pluto(limit=args.limit)
