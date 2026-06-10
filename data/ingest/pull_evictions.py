"""Pull Evictions dataset.

Socrata endpoint: 6z8x-wfk4
Join key: BBL (when available) or address
Only pulls residential evictions.
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

ENDPOINT = "6z8x-wfk4"


def pull_evictions(limit: int | None = None, days_back: int = NIGHTLY_LOOKBACK_DAYS):
    """Pull residential evictions and upsert.

    Incremental on executed_date (calendar_date), via keyset pagination — the old
    offset pagination got progressively slower on each deeper page. Pass a wide
    `days_back` for a one-off backfill.
    """
    engine = get_db_engine()

    where = (
        "residential_commercial_ind='Residential' "
        f"AND executed_date > '{since_iso(days_back)}'"
    )
    total_inserted = 0

    for results in paginate_socrata(
        ENDPOINT,
        select=(
            "court_index_number,docket_number,eviction_address,eviction_apt_num,"
            "executed_date,marshal_first_name,marshal_last_name,"
            "ejectment,eviction_possession,residential_commercial_ind,bbl,borough"
        ),
        where=where,
        limit=limit,
    ):
        df = transform_evictions(pd.DataFrame(results))

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
    df["apartment_no"] = df.get("eviction_apt_num", pd.Series([None] * len(df)))

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

    df["respondent"] = None

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
