"""Pull FDNY Building Violations dataset.

Socrata endpoint: avgm-ztsb
Join key: BIN (Building Identification Number)
"""

import logging

import pandas as pd
from sqlalchemy import text

from base import get_socrata_client, get_db_engine, normalize_borough, clean_row_for_sql

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

ENDPOINT = "avgm-ztsb"
BATCH_SIZE = 50000


def pull_fdny_violations(limit: int | None = None):
    """Pull FDNY violations and upsert."""
    client = get_socrata_client()
    client.timeout = 300
    engine = get_db_engine()

    offset = 0
    total_inserted = 0

    while True:
        batch_limit = min(BATCH_SIZE, limit - offset) if limit else BATCH_SIZE
        if limit and offset >= limit:
            break

        logger.info(f"Fetching FDNY violations offset={offset}")
        results = client.get(
            ENDPOINT,
            limit=batch_limit,
            offset=offset,
            select=(
                "violationid,violationnumber,bin,boro,block,lot,"
                "street,housenumber,violationtype,violationdesc,"
                "violationstatus,dateoccurred,closeddate"
            ),
            order="dateoccurred DESC",
        )

        if not results:
            break

        df = pd.DataFrame(results)
        if df.empty:
            break
        df = transform_fdny(df)

        records = [clean_row_for_sql(row.to_dict()) for _, row in df.iterrows()]
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO fdny_violations (
                        external_id, bbl, bin, violation_number, violation_type,
                        description, status, violation_date, close_date,
                        address, borough
                    ) VALUES (
                        :external_id, :bbl, :bin, :violation_number, :violation_type,
                        :description, :status, :violation_date, :close_date,
                        :address, :borough
                    ) ON CONFLICT (external_id) DO UPDATE SET
                        status = EXCLUDED.status,
                        close_date = EXCLUDED.close_date
                """),
                records,
            )

        total_inserted += len(df)
        offset += batch_limit
        logger.info(f"Upserted {total_inserted} FDNY violations so far")

    logger.info(f"FDNY violations complete. Total: {total_inserted}")
    return total_inserted


def transform_fdny(df: pd.DataFrame) -> pd.DataFrame:
    """Transform raw FDNY violation data."""
    df = df.rename(
        columns={
            "violationid": "external_id",
            "violationnumber": "violation_number",
            "violationtype": "violation_type",
            "violationdesc": "description",
            "violationstatus": "status",
            "dateoccurred": "violation_date",
            "closeddate": "close_date",
            "boro": "borough_raw",
            "street": "street_name",
            "housenumber": "house_number",
        }
    )

    df["external_id"] = "FDNY-" + df["external_id"].astype(str)

    # Construct address
    df["address"] = (
        df.get("house_number", pd.Series([""] * len(df))).fillna("") + " " +
        df.get("street_name", pd.Series([""] * len(df))).fillna("")
    ).str.upper().str.strip()

    # Normalize borough
    df["borough"] = df.get("borough_raw", pd.Series([None] * len(df))).astype(str).replace("nan", None).apply(
        lambda x: normalize_borough(x) if x else None
    )

    # Build BBL from boro+block+lot when all present
    if all(c in df.columns for c in ["borough_raw", "block", "lot"]):
        def make_bbl(row):
            try:
                boro = str(row.get("borough_raw", "")).strip()
                block = str(row.get("block", "")).strip().zfill(5)
                lot = str(row.get("lot", "")).strip().zfill(4)
                if boro and block and lot and boro.isdigit():
                    return boro + block + lot
            except Exception:
                pass
            return None
        df["bbl"] = df.apply(make_bbl, axis=1)
    else:
        df["bbl"] = None

    # Normalize BIN
    if "bin" in df.columns:
        df["bin"] = df["bin"].astype(str).str.strip().replace("nan", None).replace("0", None)
    else:
        df["bin"] = None

    for col in ["violation_date", "close_date"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    keep = ["external_id", "bbl", "bin", "violation_number", "violation_type",
            "description", "status", "violation_date", "close_date", "address", "borough"]
    return df[[c for c in keep if c in df.columns]].reindex(columns=keep)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Pull FDNY building violations")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    pull_fdny_violations(limit=args.limit)
