"""Pull Evictions dataset.

Socrata endpoint: 6z8x-wfk4
Join key: BBL (when available) or address
Only pulls residential evictions.
"""

import logging

import pandas as pd
from sqlalchemy import text

from base import get_socrata_client, get_db_engine, normalize_borough, clean_row_for_sql

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

ENDPOINT = "6z8x-wfk4"
BATCH_SIZE = 50000


def pull_evictions(limit: int | None = None):
    """Pull evictions and upsert."""
    client = get_socrata_client()
    client.timeout = 300
    engine = get_db_engine()

    offset = 0
    total_inserted = 0

    while True:
        batch_limit = min(BATCH_SIZE, limit - offset) if limit else BATCH_SIZE
        if limit and offset >= limit:
            break

        logger.info(f"Fetching evictions offset={offset}")
        results = client.get(
            ENDPOINT,
            limit=batch_limit,
            offset=offset,
            select=(
                "court_index_number,docket_number,eviction_address,apartment_no,"
                "executed_date,marshal_first_name,marshal_last_name,"
                "respondent_first_name,respondent_last_name,"
                "ejectment,eviction_possession,residential_commercial_ind,bbl,borough"
            ),
            where="residential_commercial_ind='RESIDENTIAL'",
            order="executed_date DESC",
        )

        if not results:
            break

        df = pd.DataFrame(results)
        if df.empty:
            break
        df = transform_evictions(df)

        records = [clean_row_for_sql(row.to_dict()) for _, row in df.iterrows()]
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO evictions (
                        external_id, bbl, address, borough, apartment_no,
                        respondent, executed_date, marshal_name,
                        eviction_type, residential_commercial
                    ) VALUES (
                        :external_id, :bbl, :address, :borough, :apartment_no,
                        :respondent, :executed_date, :marshal_name,
                        :eviction_type, :residential_commercial
                    ) ON CONFLICT (external_id) DO UPDATE SET
                        bbl = EXCLUDED.bbl,
                        executed_date = EXCLUDED.executed_date
                """),
                records,
            )

        total_inserted += len(df)
        offset += batch_limit
        logger.info(f"Upserted {total_inserted} evictions so far")

    logger.info(f"Evictions complete. Total: {total_inserted}")
    return total_inserted


def transform_evictions(df: pd.DataFrame) -> pd.DataFrame:
    """Transform raw eviction data."""
    # Build unique external ID from court index + docket
    df["external_id"] = "EVICT-" + (
        df.get("court_index_number", pd.Series([""] * len(df))).fillna("").astype(str) + "-" +
        df.get("docket_number", pd.Series([""] * len(df))).fillna("").astype(str)
    )

    df["address"] = df.get("eviction_address", pd.Series([None] * len(df))).fillna("").str.upper().str.strip()

    # BBL cleanup
    if "bbl" in df.columns:
        df["bbl"] = (
            pd.to_numeric(df["bbl"], errors="coerce")
            .fillna(0)
            .astype(int)
            .astype(str)
            .str.zfill(10)
            .replace("0000000000", None)
        )
    else:
        df["bbl"] = None

    df["borough"] = df.get("borough", pd.Series([None] * len(df))).astype(str).replace("nan", None).apply(
        lambda x: normalize_borough(x) if x else None
    )

    # Respondent full name
    df["respondent"] = (
        df.get("respondent_first_name", pd.Series([""] * len(df))).fillna("") + " " +
        df.get("respondent_last_name", pd.Series([""] * len(df))).fillna("")
    ).str.strip().replace("", None)

    # Marshal full name
    df["marshal_name"] = (
        df.get("marshal_first_name", pd.Series([""] * len(df))).fillna("") + " " +
        df.get("marshal_last_name", pd.Series([""] * len(df))).fillna("")
    ).str.strip().replace("", None)

    # Eviction type: prefer possession over ejectment
    def eviction_type(row):
        if str(row.get("eviction_possession", "")).upper() == "Y":
            return "POSSESSION"
        if str(row.get("ejectment", "")).upper() == "Y":
            return "EJECTMENT"
        return None
    df["eviction_type"] = df.apply(eviction_type, axis=1)

    df["residential_commercial"] = df.get("residential_commercial_ind", pd.Series([None] * len(df)))

    if "executed_date" in df.columns:
        df["executed_date"] = pd.to_datetime(df["executed_date"], errors="coerce")

    keep = ["external_id", "bbl", "address", "borough", "apartment_no",
            "respondent", "executed_date", "marshal_name", "eviction_type", "residential_commercial"]
    return df[[c for c in keep if c in df.columns]].reindex(columns=keep)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Pull evictions data")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    pull_evictions(limit=args.limit)
