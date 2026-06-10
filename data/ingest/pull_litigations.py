"""Pull Housing Litigations dataset.

Socrata endpoint: 59kj-x8nc
Join key: BBL
"""

import logging

import pandas as pd
from sqlalchemy import text

from base import (
    paginate_socrata,
    get_db_engine,
    clean_row_for_sql,
    since_iso,
    NIGHTLY_LOOKBACK_DAYS,
)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

ENDPOINT = "59kj-x8nc"


def pull_litigations(limit: int | None = None, days_back: int = NIGHTLY_LOOKBACK_DAYS):
    """Pull housing litigations and upsert into litigations table.

    Incremental on caseopendate (calendar_date), via keyset pagination — the old
    offset pagination re-scanned every prior row on each page (progressively
    slower the deeper it got). Pass a wide `days_back` for a one-off backfill.
    """
    engine = get_db_engine()

    where = f"caseopendate > '{since_iso(days_back)}'"
    total_inserted = 0

    for results in paginate_socrata(
        ENDPOINT,
        select=(
            "litigationid,boroid,block,lot,bbl,"
            "casetype,casestatus,caseopendate,"
            "casejudgement,respondent"
        ),
        where=where,
        limit=limit,
    ):
        df = transform_litigations(pd.DataFrame(results))

        records = [clean_row_for_sql(row.to_dict()) for _, row in df.iterrows()]
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO litigations (
                        external_id, bbl, case_type, case_status,
                        case_open_date, case_judgment,
                        respondent
                    ) VALUES (
                        :external_id, :bbl, :case_type, :case_status,
                        :case_open_date, :case_judgment,
                        :respondent
                    ) ON CONFLICT (external_id) DO UPDATE SET
                        case_status = EXCLUDED.case_status
                """),
                records,
            )

        total_inserted += len(df)
        logger.info(f"Upserted {total_inserted} litigations so far")

    logger.info(f"Litigations complete. Total: {total_inserted}")
    return total_inserted


def transform_litigations(df: pd.DataFrame) -> pd.DataFrame:
    """Transform raw litigation data."""
    df = df.rename(
        columns={
            "litigationid": "external_id",
            "casetype": "case_type",
            "casestatus": "case_status",
            "caseopendate": "case_open_date",
            "casejudgement": "case_judgment",
        }
    )

    df["external_id"] = "LIT-" + df["external_id"].astype(str)

    # Fix BBL float parsing (Socrata returns as float string)
    if "bbl" in df.columns:
        df["bbl"] = pd.to_numeric(df["bbl"], errors="coerce").fillna(0).astype(int).astype(str).str.zfill(10)

    # Truncate to fit DB column sizes
    if "respondent" in df.columns:
        df["respondent"] = df["respondent"].astype(str).replace("None", None).str[:200]
    if "case_type" in df.columns:
        df["case_type"] = df["case_type"].astype(str).replace("None", None).str[:100]
    if "case_status" in df.columns:
        df["case_status"] = df["case_status"].astype(str).replace("None", None).str[:50]

    for col in ["case_open_date"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    return df


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Pull housing litigations")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    pull_litigations(limit=args.limit)
