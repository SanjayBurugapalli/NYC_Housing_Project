"""Pull 311 Complaints dataset — incremental by date.

Socrata endpoint: erm2-nwe9
Join key: Address (needs normalization)
Categories: HEATING, PLUMBING, NOISE, PEST, WATER SYSTEM, etc.
"""

import logging
from datetime import datetime, timedelta

import pandas as pd
from sqlalchemy import text

from base import paginate_socrata, get_db_engine, normalize_borough, clean_row_for_sql

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

ENDPOINT = "erm2-nwe9"

# Map 311 complaint types to scoring categories
COMPLAINT_CATEGORY_MAP = {
    "HEATING": "heat",
    "HEAT/HOT WATER": "heat",
    "PLUMBING": "heat",
    "WATER SYSTEM": "heat",
    "Noise - Residential": "noise",
    "Noise - Commercial": "noise",
    "Noise - Street/Sidewalk": "noise",
    "Noise - Vehicle": "noise",
    "Noise": "noise",
    "NOISE": "noise",
    "Rodent": "pest",
    "PEST CONTROL": "pest",
    "Pest": "pest",
    "UNSANITARY CONDITION": "pest",
    "GENERAL CONSTRUCTION": "structural",
    "SAFETY": "structural",
    "ELEVATOR": "structural",
    "CONSTRUCTION": "structural",
    "ELECTRIC": "structural",
}


def pull_311(limit: int | None = None, days_back: int = 365):
    """Pull 311 complaints. Incremental — only fetches since last sync."""
    engine = get_db_engine()

    since_date = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%dT00:00:00")

    # Residential complaint types we care about
    relevant_types = list(COMPLAINT_CATEGORY_MAP.keys())
    type_filter = " OR ".join(f"complaint_type='{t}'" for t in relevant_types)
    where = f"created_date > '{since_date}' AND ({type_filter})"
    # NOTE: the 311 dataset exposes `bbl` directly — select it so complaints
    # link to buildings without relying on address normalization. ~36% of
    # building-routed types (HEAT/HOT WATER, PLUMBING, UNSANITARY) were
    # previously dropped from scoring for lack of a BBL.
    select = (
        "unique_key,complaint_type,descriptor,status,"
        "created_date,closed_date,incident_address,borough,"
        "incident_zip,latitude,longitude,bbl"
    )

    total_inserted = 0
    for results in paginate_socrata(ENDPOINT, select=select, where=where, limit=limit):
        df = transform_311(pd.DataFrame(results))

        records = [clean_row_for_sql(row.to_dict()) for _, row in df.iterrows()]
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO complaints (
                        external_id, source, complaint_type, descriptor,
                        status, description, address, borough, category,
                        created_date, closed_date, bbl
                    ) VALUES (
                        :external_id, '311', :complaint_type, :descriptor,
                        :status, :description, :address, :borough, :category,
                        :created_date, :closed_date, :bbl
                    ) ON CONFLICT (external_id) DO UPDATE SET
                        status = EXCLUDED.status,
                        closed_date = EXCLUDED.closed_date,
                        -- Backfill BBL on re-pull; keep an existing value if the
                        -- source row no longer carries one.
                        bbl = COALESCE(EXCLUDED.bbl, complaints.bbl)
                """),
                records,
            )

        total_inserted += len(df)
        logger.info(f"Upserted {total_inserted} complaints so far")

    logger.info(f"311 ingestion complete. Total: {total_inserted}")
    return total_inserted


def transform_311(df: pd.DataFrame) -> pd.DataFrame:
    """Transform raw 311 data for insertion."""
    df = df.rename(
        columns={
            "unique_key": "external_id",
            "incident_address": "address",
        }
    )

    # Categorize complaints
    df["category"] = df["complaint_type"].map(COMPLAINT_CATEGORY_MAP)
    df["description"] = df.get("descriptor", "")
    df["borough"] = df["borough"].apply(normalize_borough)

    # Parse dates
    for col in ["created_date", "closed_date"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    # Normalize address for later matching
    if "address" in df.columns:
        df["address"] = df["address"].str.upper().str.strip()

    # Normalize BBL to a 10-digit string (Socrata returns it as a float-ish
    # string like "1000570001.0"); blank/zero/NaN become None so they don't
    # masquerade as a real lot.
    if "bbl" in df.columns:
        bbl = pd.to_numeric(df["bbl"], errors="coerce")
        df["bbl"] = bbl.apply(
            lambda v: str(int(v)).zfill(10) if pd.notna(v) and v > 0 else None
        )
    else:
        df["bbl"] = None

    return df


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Pull 311 complaints")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--days-back", type=int, default=1095)
    args = parser.parse_args()
    pull_311(limit=args.limit, days_back=args.days_back)
