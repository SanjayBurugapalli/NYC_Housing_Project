"""Recompute building_listing_signal from recent listings_raw rows."""
import logging
from datetime import datetime, timedelta, timezone

import psycopg2

from .config import Config

logger = logging.getLogger(__name__)


def update_building_signals(conn: psycopg2.extensions.connection, cfg: Config) -> int:
    """Upsert building_listing_signal for all buildings with recent listings.

    Returns the number of building rows updated.
    """
    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=cfg.freshness_hours)

    sql = """
        INSERT INTO building_listing_signal (
            building_id,
            active_listings_count,
            min_price,
            max_price,
            last_seen,
            updated_at
        )
        SELECT
            building_id,
            COUNT(*)         AS active_listings_count,
            MIN(price)       AS min_price,
            MAX(price)       AS max_price,
            MAX(fetched_at)  AS last_seen,
            NOW()            AS updated_at
        FROM listings_raw
        WHERE building_id IS NOT NULL
          AND fetched_at  >= %s
          AND price       IS NOT NULL
        GROUP BY building_id
        ON CONFLICT (building_id) DO UPDATE SET
            active_listings_count = EXCLUDED.active_listings_count,
            min_price             = EXCLUDED.min_price,
            max_price             = EXCLUDED.max_price,
            last_seen             = EXCLUDED.last_seen,
            updated_at            = EXCLUDED.updated_at
    """
    with conn.cursor() as cur:
        cur.execute(sql, (cutoff,))
        count = cur.rowcount
    conn.commit()
    logger.info(f"Aggregator: updated {count} building signal rows (freshness={cfg.freshness_hours}h)")
    return count
