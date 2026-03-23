"""Pull Rodent Inspections dataset.

Socrata endpoint: p937-wjvj
Join key: Address (needs normalization + BBL matching)
"""

import logging

import pandas as pd
from sqlalchemy import text

from base import get_socrata_client, get_db_engine, normalize_borough, clean_row_for_sql

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

ENDPOINT = "p937-wjvj"
BATCH_SIZE = 50000


def pull_rodent_inspections(limit: int | None = None):
    """Pull rodent inspections and upsert."""
    client = get_socrata_client()
    engine = get_db_engine()

    offset = 0
    total_inserted = 0

    while True:
        batch_limit = min(BATCH_SIZE, limit - offset) if limit else BATCH_SIZE
        if limit and offset >= limit:
            break

        logger.info(f"Fetching rodent inspections offset={offset}")
        results = client.get(
            ENDPOINT,
            limit=batch_limit,
            offset=offset,
            select="job_id,inspection_type,result,"
            "approved_date,inspection_date,"
            "house_number,street_name,boro_code,"
            "zip_code,latitude,longitude,bbl",
            order="inspection_date DESC",
        )

        if not results:
            break

        df = pd.DataFrame(results)
        df = transform_rodent(df)

        records = [clean_row_for_sql(row.to_dict()) for _, row in df.iterrows()]
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO rodent_inspections (
                        external_id, address, borough, zipcode, bbl,
                        inspection_type, result, approved_date,
                        inspection_date, latitude, longitude
                    ) VALUES (
                        :external_id, :address, :borough, :zipcode, :bbl,
                        :inspection_type, :result, :approved_date,
                        :inspection_date, :latitude, :longitude
                    ) ON CONFLICT (external_id) DO UPDATE SET
                        result = EXCLUDED.result
                """),
                records,
            )

        total_inserted += len(df)
        offset += batch_limit
        logger.info(f"Upserted {total_inserted} rodent inspections so far")

    logger.info(f"Rodent inspections complete. Total: {total_inserted}")
    return total_inserted


def transform_rodent(df: pd.DataFrame) -> pd.DataFrame:
    """Transform raw rodent inspection data."""
    df = df.rename(
        columns={
            "job_id": "external_id",
            "zip_code": "zipcode",
            "boro_code": "borough",
        }
    )

    df["external_id"] = "ROD-" + df["external_id"].astype(str)

    # Construct address from house_number + street_name
    df["address"] = (
        df.get("house_number", "").fillna("") + " " + df.get("street_name", "").fillna("")
    ).str.upper().str.strip()

    df["borough"] = df["borough"].apply(normalize_borough)
    if "bbl" in df.columns:
        df["bbl"] = pd.to_numeric(df["bbl"], errors="coerce").fillna(0).astype(int).astype(str).str.zfill(10)

    for col in ["latitude", "longitude"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    for col in ["inspection_date", "approved_date"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    return df


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Pull rodent inspections")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    pull_rodent_inspections(limit=args.limit)
