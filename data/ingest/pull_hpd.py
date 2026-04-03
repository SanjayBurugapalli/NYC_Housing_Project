"""Pull HPD Violations and HPD Complaints.

HPD Violations: wvxf-dwi5 (join key: BBL, severity: Class A/B/C)
HPD Complaints: uwyv-629c (join key: BBL)
"""

import logging

import pandas as pd
from sqlalchemy import text

from base import get_socrata_client, get_db_engine, normalize_borough, clean_row_for_sql

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

HPD_VIOLATIONS_ENDPOINT = "wvxf-dwi5"
HPD_COMPLAINTS_ENDPOINT = "uwyv-629c"
BATCH_SIZE = 50000


def pull_hpd_violations(limit: int | None = None):
    """Pull HPD violations with Class A/B/C severity."""
    client = get_socrata_client()
    client.timeout = 300
    engine = get_db_engine()

    offset = 0
    total_inserted = 0

    while True:
        batch_limit = min(BATCH_SIZE, limit - offset) if limit else BATCH_SIZE
        if limit and offset >= limit:
            break

        logger.info(f"Fetching HPD violations offset={offset}")
        results = client.get(
            HPD_VIOLATIONS_ENDPOINT,
            limit=batch_limit,
            offset=offset,
            select="violationid,boroid,block,lot,"
            "class,inspectiondate,approveddate,"
            "originalcertifybydate,originalcorrectbydate,"
            "violationstatus,ordernumber,novdescription",
            order="inspectiondate DESC",
        )

        if not results:
            break

        df = pd.DataFrame(results)
        df = transform_hpd_violations(df)

        records = [clean_row_for_sql(row.to_dict()) for _, row in df.iterrows()]
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO violations (
                        external_id, bbl, source, violation_type, severity,
                        order_number, status, description, category,
                        inspection_date, approved_date,
                        original_certify_by_date, original_correct_by_date
                    ) VALUES (
                        :external_id, :bbl, 'HPD', :violation_type, :severity,
                        :order_number, :status, :description, :category,
                        :inspection_date, :approved_date,
                        :original_certify_by_date, :original_correct_by_date
                    ) ON CONFLICT (external_id) DO UPDATE SET
                        status = EXCLUDED.status
                """),
                records,
            )

        total_inserted += len(df)
        offset += batch_limit
        logger.info(f"Upserted {total_inserted} HPD violations so far")

    logger.info(f"HPD violations complete. Total: {total_inserted}")
    return total_inserted


def transform_hpd_violations(df: pd.DataFrame) -> pd.DataFrame:
    """Transform raw HPD violation data."""
    df = df.rename(
        columns={
            "violationid": "external_id",
            "class": "severity",
            "inspectiondate": "inspection_date",
            "approveddate": "approved_date",
            "originalcertifybydate": "original_certify_by_date",
            "originalcorrectbydate": "original_correct_by_date",
            "violationstatus": "status",
            "ordernumber": "order_number",
            "novdescription": "description",
        }
    )

    df["external_id"] = "HPD-V-" + df["external_id"].astype(str)

    # Construct BBL from boroid (1 digit) + block (5 digits) + lot (4 digits)
    df["boroid"] = pd.to_numeric(df["boroid"], errors="coerce").fillna(0).astype(int).astype(str)
    df["block"] = pd.to_numeric(df["block"], errors="coerce").fillna(0).astype(int).astype(str).str.zfill(5)
    df["lot"] = pd.to_numeric(df["lot"], errors="coerce").fillna(0).astype(int).astype(str).str.zfill(4)
    df["bbl"] = df["boroid"] + df["block"] + df["lot"]

    df["violation_type"] = "HPD"

    # Categorize by severity
    df["category"] = df["severity"].map({"A": "hpd_a", "B": "hpd_b", "C": "hpd_c"})

    for col in ["inspection_date", "approved_date", "original_certify_by_date", "original_correct_by_date"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    return df


def pull_hpd_complaints(limit: int | None = None):
    """Pull HPD complaints."""
    client = get_socrata_client()
    client.timeout = 300
    engine = get_db_engine()

    offset = 0
    total_inserted = 0

    while True:
        batch_limit = min(BATCH_SIZE, limit - offset) if limit else BATCH_SIZE
        if limit and offset >= limit:
            break

        logger.info(f"Fetching HPD complaints offset={offset}")
        results = client.get(
            HPD_COMPLAINTS_ENDPOINT,
            limit=batch_limit,
            offset=offset,
            select="complaintid,bbl,boroughid,block,lot,"
            "statusid,statusdate,statusdescription,"
            "majorcategory,minorcategory,receiveddate",
            order="receiveddate DESC",
        )

        if not results:
            break

        df = pd.DataFrame(results)
        df = transform_hpd_complaints(df)

        records = [clean_row_for_sql(row.to_dict()) for _, row in df.iterrows()]
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO complaints (
                        external_id, bbl, source, complaint_type,
                        descriptor, status, status_date, description,
                        category, created_date
                    ) VALUES (
                        :external_id, :bbl, 'HPD', :complaint_type,
                        :descriptor, :status, :status_date, :description,
                        :category, :created_date
                    ) ON CONFLICT (external_id) DO UPDATE SET
                        status = EXCLUDED.status,
                        status_date = EXCLUDED.status_date
                """),
                records,
            )

        total_inserted += len(df)
        offset += batch_limit
        logger.info(f"Upserted {total_inserted} HPD complaints so far")

    logger.info(f"HPD complaints complete. Total: {total_inserted}")
    return total_inserted


HPD_CATEGORY_MAP = {
    "HEAT/HOT WATER": "heat",
    "PLUMBING": "heat",
    "WATER LEAK": "heat",
    "PAINT/PLASTER": "structural",
    "DOOR/WINDOW": "structural",
    "FLOORING": "structural",
    "SAFETY": "structural",
    "ELEVATOR": "structural",
    "ELECTRIC": "structural",
    "GENERAL": "structural",
    "PEST CONTROL": "pest",
    "UNSANITARY CONDITION": "pest",
}


def transform_hpd_complaints(df: pd.DataFrame) -> pd.DataFrame:
    """Transform raw HPD complaint data."""
    df = df.rename(
        columns={
            "complaintid": "external_id",
            "statusdescription": "description",
            "majorcategory": "complaint_type",
            "minorcategory": "descriptor",
            "receiveddate": "created_date",
            "statusid": "status",
            "statusdate": "status_date",
        }
    )

    df["external_id"] = "HPD-C-" + df["external_id"].astype(str)
    df["bbl"] = df["bbl"].astype(str).str.zfill(10) if "bbl" in df.columns else None
    df["category"] = df["complaint_type"].map(HPD_CATEGORY_MAP)

    for col in ["created_date", "status_date"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    return df


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Pull HPD data")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--violations-only", action="store_true")
    parser.add_argument("--complaints-only", action="store_true")
    args = parser.parse_args()

    if not args.complaints_only:
        pull_hpd_violations(limit=args.limit)
    if not args.violations_only:
        pull_hpd_complaints(limit=args.limit)
