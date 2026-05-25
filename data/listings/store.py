"""Persist listings to the database."""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

import psycopg2
import psycopg2.extras

from .config import Config
from .models import Listing

logger = logging.getLogger(__name__)


def upsert_listings(
    conn: psycopg2.extensions.connection,
    listings: list[Listing],
    building_ids: list[Optional[int]],
    cfg: Config,  # noqa: ARG001 — kept for API symmetry with other store functions
) -> int:
    """Insert or update listings_raw rows. Returns number of rows processed."""
    if not listings:
        return 0

    rows = [
        {
            "listing_id": l.listing_id,
            "source": l.source,
            "lat": l.lat,
            "lon": l.lon,
            "price": l.price,
            "beds": l.beds,
            "address": l.address,
            "fetched_at": l.fetched_at,
            "building_id": bid,
        }
        for l, bid in zip(listings, building_ids)
    ]

    sql = """
        INSERT INTO listings_raw
            (listing_id, source, lat, lon, price, beds, address, fetched_at, building_id)
        VALUES
            (%(listing_id)s, %(source)s, %(lat)s, %(lon)s,
             %(price)s, %(beds)s, %(address)s, %(fetched_at)s, %(building_id)s)
        ON CONFLICT (listing_id, source) DO UPDATE SET
            lat         = EXCLUDED.lat,
            lon         = EXCLUDED.lon,
            price       = EXCLUDED.price,
            beds        = EXCLUDED.beds,
            address     = EXCLUDED.address,
            fetched_at  = EXCLUDED.fetched_at,
            building_id = EXCLUDED.building_id
    """
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, sql, rows, page_size=500)
    conn.commit()
    return len(rows)


def log_raw_sample(
    conn: psycopg2.extensions.connection,
    source: str,
    payload: object,
) -> None:
    """Persist one raw API response to listing_raw_log for debugging."""
    sql = """
        INSERT INTO listing_raw_log (source, payload, logged_at)
        VALUES (%s, %s, %s)
    """
    try:
        with conn.cursor() as cur:
            cur.execute(sql, (source, json.dumps(payload, default=str), datetime.now(tz=timezone.utc)))
        conn.commit()
    except Exception as exc:
        logger.warning(f"Failed to write raw log sample: {exc}")
        conn.rollback()
