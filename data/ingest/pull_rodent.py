"""Pull Rodent Inspections dataset.

Socrata endpoint: p937-wjvj
Join key: Address (needs normalization + BBL matching)
"""

import logging

import pandas as pd
from sqlalchemy import text

from base import (
    paginate_socrata,
    get_db_engine,
    normalize_borough,
    clean_row_for_sql,
    since_iso,
    NIGHTLY_LOOKBACK_DAYS,
)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

ENDPOINT = "p937-wjvj"


def pull_rodent_inspections(limit: int | None = None, days_back: int = NIGHTLY_LOOKBACK_DAYS):
    """Pull rodent inspections and upsert.

    Incremental on inspection_date (calendar_date), via keyset pagination — the
    old offset pagination got progressively slower on each deeper page. Pass a
    wide `days_back` for a one-off backfill.
    """
    engine = get_db_engine()

    where = f"inspection_date > '{since_iso(days_back)}'"
    total_inserted = 0

    for results in paginate_socrata(
        ENDPOINT,
        # The city dropped approved_date from this dataset in 2026; rows loaded
        # before then keep theirs, new rows leave the column NULL.
        select=(
            "job_id,inspection_type,result,"
            "inspection_date,"
            "house_number,street_name,boro_code,"
            "zip_code,latitude,longitude,bbl"
        ),
        where=where,
        limit=limit,
    ):
        df = transform_rodent(pd.DataFrame(results))

        records = [clean_row_for_sql(row.to_dict()) for _, row in df.iterrows()]
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO rodent_inspections (
                        external_id, address, borough, zipcode, bbl,
                        inspection_type, result,
                        inspection_date, latitude, longitude
                    ) VALUES (
                        :external_id, :address, :borough, :zipcode, :bbl,
                        :inspection_type, :result,
                        :inspection_date, :latitude, :longitude
                    ) ON CONFLICT (external_id) DO UPDATE SET
                        result = EXCLUDED.result
                """),
                records,
            )

        total_inserted += len(df)
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

    df["borough"] = df["borough"].astype(str).replace("nan", None).apply(
        lambda x: normalize_borough(x) if x else None
    )
    if "bbl" in df.columns:
        df["bbl"] = pd.to_numeric(df["bbl"], errors="coerce").fillna(0).astype(int).astype(str).str.zfill(10)

    for col in ["latitude", "longitude"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    if "inspection_date" in df.columns:
        df["inspection_date"] = pd.to_datetime(df["inspection_date"], errors="coerce")

    return df


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Pull rodent inspections")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    pull_rodent_inspections(limit=args.limit)
