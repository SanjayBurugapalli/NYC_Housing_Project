"""Pull DOB Violations and DOB Complaints.

DOB Violations: 3h2n-5cm9 (join key: BIN)
DOB Complaints: eabe-havv (join key: BIN)
"""

import logging

import pandas as pd
from sqlalchemy import text

from base import get_socrata_client, get_db_engine, clean_row_for_sql

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

DOB_VIOLATIONS_ENDPOINT = "3h2n-5cm9"
DOB_COMPLAINTS_ENDPOINT = "eabe-havv"
BATCH_SIZE = 50000


def pull_dob_violations(limit: int | None = None):
    """Pull DOB violations (structural/safety)."""
    client = get_socrata_client()
    engine = get_db_engine()

    offset = 0
    total_inserted = 0

    while True:
        batch_limit = min(BATCH_SIZE, limit - offset) if limit else BATCH_SIZE
        if limit and offset >= limit:
            break

        logger.info(f"Fetching DOB violations offset={offset}")
        results = client.get(
            DOB_VIOLATIONS_ENDPOINT,
            limit=batch_limit,
            offset=offset,
            select="isn_dob_bis_viol,boro,block,lot,violation_type,"
            "violation_category,issue_date,"
            "violation_type_code,description,"
            "disposition_date,disposition_comments",
            order="issue_date DESC",
        )

        if not results:
            break

        df = pd.DataFrame(results)
        df = transform_dob_violations(df)

        records = [clean_row_for_sql(row.to_dict()) for _, row in df.iterrows()]
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO violations (
                        external_id, bbl, source, violation_type,
                        status, description, category, inspection_date
                    ) VALUES (
                        :external_id, :bbl, 'DOB', :violation_type,
                        :status, :description, 'structural', :inspection_date
                    ) ON CONFLICT (external_id) DO UPDATE SET
                        status = EXCLUDED.status
                """),
                records,
            )

        total_inserted += len(df)
        offset += batch_limit
        logger.info(f"Upserted {total_inserted} DOB violations so far")

    logger.info(f"DOB violations complete. Total: {total_inserted}")
    return total_inserted


def transform_dob_violations(df: pd.DataFrame) -> pd.DataFrame:
    """Transform raw DOB violation data."""
    # Drop raw violation_type to avoid duplicate after rename
    df = df.drop(columns=["violation_type"], errors="ignore")
    df = df.rename(
        columns={
            "isn_dob_bis_viol": "external_id",
            "violation_category": "violation_type",
            "issue_date": "inspection_date",
            "disposition_comments": "status",
        }
    )

    df["external_id"] = "DOB-V-" + df["external_id"].astype(str)

    # Construct BBL from boro (1 digit) + block (5 digits) + lot (4 digits)
    df["boro"] = pd.to_numeric(df["boro"], errors="coerce").fillna(0).astype(int).astype(str)
    df["block"] = pd.to_numeric(df["block"], errors="coerce").fillna(0).astype(int).astype(str).str.zfill(5)
    df["lot"] = pd.to_numeric(df["lot"], errors="coerce").fillna(0).astype(int).astype(str).str.zfill(4)
    df["bbl"] = (df["boro"] + df["block"] + df["lot"]).str[:10]

    # Ensure status column exists and truncate to fit DB
    if "status" not in df.columns:
        df["status"] = None
    df["status"] = df["status"].astype(str).replace("None", None).replace("nan", None).str[:255]
    if "violation_type" in df.columns:
        df["violation_type"] = df["violation_type"].astype(str).str[:100]
    if "description" not in df.columns:
        df["description"] = None

    if "inspection_date" in df.columns:
        df["inspection_date"] = pd.to_datetime(df["inspection_date"], errors="coerce")

    return df


def pull_dob_complaints(limit: int | None = None):
    """Pull DOB complaints."""
    client = get_socrata_client()
    engine = get_db_engine()

    offset = 0
    total_inserted = 0

    while True:
        batch_limit = min(BATCH_SIZE, limit - offset) if limit else BATCH_SIZE
        if limit and offset >= limit:
            break

        logger.info(f"Fetching DOB complaints offset={offset}")
        results = client.get(
            DOB_COMPLAINTS_ENDPOINT,
            limit=batch_limit,
            offset=offset,
            select="complaint_number,bin,complaint_category,"
            "status,date_entered,disposition_date,"
            "disposition_code",
            order="date_entered DESC",
        )

        if not results:
            break

        df = pd.DataFrame(results)
        df = transform_dob_complaints(df)

        records = [clean_row_for_sql(row.to_dict()) for _, row in df.iterrows()]
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO complaints (
                        external_id, bin, source, complaint_type,
                        status, category, created_date, closed_date
                    ) VALUES (
                        :external_id, :bin, 'DOB', :complaint_type,
                        :status, 'structural', :created_date, :closed_date
                    ) ON CONFLICT (external_id) DO UPDATE SET
                        status = EXCLUDED.status,
                        closed_date = EXCLUDED.closed_date
                """),
                records,
            )

        total_inserted += len(df)
        offset += batch_limit
        logger.info(f"Upserted {total_inserted} DOB complaints so far")

    logger.info(f"DOB complaints complete. Total: {total_inserted}")
    return total_inserted


def transform_dob_complaints(df: pd.DataFrame) -> pd.DataFrame:
    """Transform raw DOB complaint data."""
    df = df.rename(
        columns={
            "complaint_number": "external_id",
            "complaint_category": "complaint_type",
            "date_entered": "created_date",
            "disposition_date": "closed_date",
        }
    )

    df["external_id"] = "DOB-C-" + df["external_id"].astype(str)
    df["bin"] = df["bin"].astype(str).str.strip() if "bin" in df.columns else None

    for col in ["created_date", "closed_date"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    return df


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Pull DOB data")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--violations-only", action="store_true")
    parser.add_argument("--complaints-only", action="store_true")
    args = parser.parse_args()

    if not args.complaints_only:
        pull_dob_violations(limit=args.limit)
    if not args.violations_only:
        pull_dob_complaints(limit=args.limit)
