"""Shared utilities for data ingestion scripts."""

import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator

from sodapy import Socrata
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

logger = logging.getLogger(__name__)

# Add backend to path for model imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "backend"))

import pandas as pd


def clean_row_for_sql(row_dict: dict) -> dict:
    """Convert pandas NaT/NaN to None for SQL insertion."""
    return {k: (None if pd.isna(v) else v) for k, v in row_dict.items()}


SOCRATA_DOMAIN = "data.cityofnewyork.us"
SOCRATA_APP_TOKEN = os.environ.get("SOCRATA_APP_TOKEN")

# Default Socrata HTTP read timeout (seconds) and page size for keyset pagination.
SOCRATA_TIMEOUT = 300
SOCRATA_PAGE_SIZE = 50000

# Default rolling lookback (days) for nightly incremental pulls. Generous enough
# to self-heal across several missed nights while staying tiny vs. full history;
# the DB accumulates across runs (upsert, never delete), so a window this size
# keeps the full multi-year store fresh as long as we don't miss this many days
# in a row. A one-off wide backfill overrides it via refresh.py --days-back.
NIGHTLY_LOOKBACK_DAYS = 60


def since_iso(days_back: int) -> str:
    """ISO-8601 timestamp `days_back` days ago — for calendar_date / floating_timestamp
    SoQL filters (e.g. ``created_date > '2024-01-01T00:00:00'``)."""
    return (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%dT%H:%M:%S")


def since_yyyymmdd(days_back: int) -> str:
    """YYYYMMDD string `days_back` days ago — for text date fields stored as
    fixed-width YYYYMMDD (e.g. DOB violations ``issue_date``), where lexicographic
    comparison equals chronological order."""
    return (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y%m%d")

# Sync database URL for ingestion scripts
DATABASE_URL = os.environ.get(
    "DATABASE_URL_SYNC",
    os.environ.get("DATABASE_URL", "postgresql://nyc_buildings:devpassword@localhost:5432/nyc_buildings"),
)
# Strip async driver prefix if present
if "+asyncpg" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("+asyncpg", "")


def get_socrata_client(timeout: int = SOCRATA_TIMEOUT, domain: str = SOCRATA_DOMAIN) -> Socrata:
    """Create a Socrata API client (NYC Open Data unless `domain` says otherwise).

    Socrata app tokens are platform-wide, so the same token raises the rate
    limit on other portals too (e.g. data.ny.gov).
    """
    return Socrata(domain, SOCRATA_APP_TOKEN, timeout=timeout)


def paginate_socrata(
    endpoint: str,
    select: str,
    where: str | None = None,
    *,
    page_size: int = SOCRATA_PAGE_SIZE,
    limit: int | None = None,
    timeout: int = SOCRATA_TIMEOUT,
    max_retries: int = 4,
) -> Iterator[list[dict]]:
    """Yield pages of records from a Socrata dataset using ``:id`` keyset pagination.

    Offset pagination (``$offset``) forces Socrata to scan and discard every row
    before the offset on each request, so pages get progressively slower until a
    deep page exceeds the read timeout — the failure mode that was crashing the
    311/HPD pulls. Keyset pagination instead orders by the stable system field
    ``:id`` and advances with ``:id > last_id``, so every page costs the same
    regardless of how deep we are.

    Args:
        select: SoQL ``$select`` clause WITHOUT ``:id`` — the cursor column is
            added (and stripped from yielded rows) automatically.
        where: Optional SoQL ``$where``, AND-ed with the keyset cursor.
        page_size: Rows per request.
        limit: Cap on total rows yielded across all pages (smoke tests only).
        timeout: HTTP read timeout per request, preserved across retries.
        max_retries: Attempts per page before giving up (exponential backoff).

    Yields:
        Lists of raw record dicts, one list per page. The ``:id`` cursor column
        is removed before yielding so transforms see only the requested fields.
    """
    client = get_socrata_client(timeout=timeout)
    last_id: str | None = None
    total = 0

    while True:
        if limit is not None:
            remaining = limit - total
            if remaining <= 0:
                break
            this_page = min(page_size, remaining)
        else:
            this_page = page_size

        cursor = f":id > '{last_id}'" if last_id is not None else None
        clauses = [f"({c})" for c in (where, cursor) if c]
        page_where = " AND ".join(clauses) if clauses else None

        get_kwargs: dict = {
            "select": f":id, {select}",
            "limit": this_page,
            "order": ":id",
        }
        if page_where:
            get_kwargs["where"] = page_where

        results: list[dict] | None = None
        for attempt in range(max_retries):
            try:
                results = client.get(endpoint, **get_kwargs)
                break
            except Exception as e:
                logger.warning(
                    "Socrata get failed (endpoint=%s, attempt=%d/%d): %s",
                    endpoint, attempt + 1, max_retries, e,
                )
                if attempt == max_retries - 1:
                    raise
                time.sleep(5 * (attempt + 1))
                # Recreate the client so a poisoned connection doesn't persist,
                # preserving the timeout (the old retry path silently reverted
                # to sodapy's 120s default).
                client = get_socrata_client(timeout=timeout)

        if not results:
            break

        last_id = results[-1][":id"]
        for r in results:
            r.pop(":id", None)
        total += len(results)
        yield results

        if len(results) < this_page:
            break


def get_db_engine():
    """Create a sync SQLAlchemy engine for data ingestion.

    ``executemany_mode="values_plus_batch"`` makes the psycopg2 driver batch
    executemany INSERT/UPDATE calls (via ``execute_values`` / ``execute_batch``)
    instead of issuing one network round-trip per row. The pullers and the
    ~860k-row score upsert all write via executemany, so this is the difference
    between thousands of round-trips and millions — especially over a
    higher-latency DB connection.
    """
    return create_engine(
        DATABASE_URL,
        echo=False,
        executemany_mode="values_plus_batch",
        executemany_batch_page_size=1000,
    )


def get_db_session():
    """Create a sync database session."""
    engine = get_db_engine()
    Session = sessionmaker(bind=engine)
    return Session()


BOROUGH_MAP = {
    "1": "MANHATTAN",
    "2": "BRONX",
    "3": "BROOKLYN",
    "4": "QUEENS",
    "5": "STATEN ISLAND",
    "MANHATTAN": "MANHATTAN",
    "BRONX": "BRONX",
    "BROOKLYN": "BROOKLYN",
    "QUEENS": "QUEENS",
    "STATEN ISLAND": "STATEN ISLAND",
    "NEW YORK": "MANHATTAN",
    "MN": "MANHATTAN",
    "BX": "BRONX",
    "BK": "BROOKLYN",
    "QN": "QUEENS",
    "SI": "STATEN ISLAND",
}


def normalize_borough(borough: str | None) -> str | None:
    """Normalize borough names to standard format."""
    if not borough:
        return None
    return BOROUGH_MAP.get(borough.upper().strip(), borough.upper().strip())
