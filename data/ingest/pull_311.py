"""Pull 311 Complaints dataset — incremental by date.

Socrata endpoint: erm2-nwe9
Join key: Address (needs normalization)
Categories: HEATING, PLUMBING, NOISE, PEST, WATER SYSTEM, etc.
"""

import logging
import time
from datetime import datetime, timedelta

import pandas as pd
from sqlalchemy import text

from base import get_socrata_client, get_db_engine, normalize_borough, clean_row_for_sql

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

ENDPOINT = "erm2-nwe9"
BATCH_SIZE = 50000

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
    client = get_socrata_client()
    engine = get_db_engine()

    since_date = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%dT00:00:00")

    # Residential complaint types we care about
    relevant_types = list(COMPLAINT_CATEGORY_MAP.keys())
    type_filter = " OR ".join(f"complaint_type='{t}'" for t in relevant_types)

    offset = 0
    total_inserted = 0

    while True:
        batch_limit = min(BATCH_SIZE, limit - offset) if limit else BATCH_SIZE
        if limit and offset >= limit:
            break

        logger.info(f"Fetching 311 records offset={offset}")
        results = None
        for attempt in range(3):
            try:
                results = client.get(
                    ENDPOINT,
                    limit=batch_limit,
                    offset=offset,
                    select="unique_key,complaint_type,descriptor,status,"
                    "created_date,closed_date,incident_address,borough,"
                    "incident_zip,latitude,longitude",
                    where=f"created_date > '{since_date}' AND ({type_filter})",
                    order="created_date DESC",
                )
                break
            except Exception as e:
                logger.warning(f"Attempt {attempt + 1} failed: {e}")
                if attempt < 2:
                    time.sleep(5 * (attempt + 1))
                    client = get_socrata_client()
                else:
                    raise

        if not results:
            break

        df = pd.DataFrame(results)
        df = transform_311(df)

        records = [clean_row_for_sql(row.to_dict()) for _, row in df.iterrows()]
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO complaints (
                        external_id, source, complaint_type, descriptor,
                        status, description, address, borough, category,
                        created_date, closed_date
                    ) VALUES (
                        :external_id, '311', :complaint_type, :descriptor,
                        :status, :description, :address, :borough, :category,
                        :created_date, :closed_date
                    ) ON CONFLICT (external_id) DO UPDATE SET
                        status = EXCLUDED.status,
                        closed_date = EXCLUDED.closed_date
                """),
                records,
            )

        total_inserted += len(df)
        offset += batch_limit
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

    return df


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Pull 311 complaints")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--days-back", type=int, default=1095)
    args = parser.parse_args()
    pull_311(limit=args.limit, days_back=args.days_back)
