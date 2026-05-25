"""Orchestrate tile iteration, fetching, matching, and DB writes."""
import logging
import os
import random
import time
from dataclasses import dataclass, field
from typing import Optional

import psycopg2

from .aggregator import update_building_signals
from .config import Config, load_config
from .fetchers.mock import MockFetcher
from .fetchers.playwright_base import PlaywrightBrowser
from .fetchers.streeteasy import StreetEasyFetcher
from .fetchers.zillow import ZillowFetcher
from .matcher import BuildingMatcher
from .models import Listing
from .store import log_raw_sample, upsert_listings
from .tiles import Tile, generate_tiles

logger = logging.getLogger(__name__)


@dataclass
class RunStats:
    tiles_total: int = 0
    tiles_success: int = 0
    tiles_failed: int = 0
    listings_fetched: int = 0
    listings_stored: int = 0
    listings_matched: int = 0
    source_errors: dict = field(default_factory=dict)

    def __str__(self) -> str:
        return (
            f"tiles={self.tiles_success}/{self.tiles_total} failed={self.tiles_failed} | "
            f"fetched={self.listings_fetched} stored={self.listings_stored} "
            f"matched={self.listings_matched} | errors={self.source_errors}"
        )


def _connect() -> psycopg2.extensions.connection:
    url = os.environ.get(
        "DATABASE_URL_SYNC",
        os.environ.get("DATABASE_URL", "postgresql://nyc_buildings:devpassword@localhost:5432/nyc_buildings"),
    )
    if "+asyncpg" in url:
        url = url.replace("+asyncpg", "")
    return psycopg2.connect(url)


def _process_tile(
    tile: Tile,
    fetchers: list,
    matcher: BuildingMatcher,
    conn: psycopg2.extensions.connection,
    cfg: Config,
    stats: RunStats,
) -> None:
    stats.tiles_total += 1
    all_listings: list[Listing] = []

    raw_logger = lambda source, raw: log_raw_sample(conn, source, raw)  # noqa: E731

    for fetcher in fetchers:
        try:
            listings = fetcher.fetch_tile(tile, raw_logger=raw_logger)
            all_listings.extend(listings)
            stats.listings_fetched += len(listings)
        except Exception as exc:
            logger.error(f"{fetcher.source}: unhandled error on {tile}: {exc}")
            stats.source_errors[fetcher.source] = stats.source_errors.get(fetcher.source, 0) + 1
            # Graceful degradation: continue with the other source

    if not all_listings:
        stats.tiles_success += 1
        return

    building_ids: list[Optional[int]] = []
    for listing in all_listings:
        try:
            bid = matcher.match(listing)
            building_ids.append(bid)
            if bid is not None:
                stats.listings_matched += 1
        except Exception as exc:
            logger.warning(f"Matching error for listing {listing.listing_id}: {exc}")
            building_ids.append(None)

    try:
        stored = upsert_listings(conn, all_listings, building_ids, cfg)
        stats.listings_stored += stored
        stats.tiles_success += 1
    except Exception as exc:
        logger.error(f"DB write failed for {tile}: {exc}")
        conn.rollback()
        stats.tiles_failed += 1


def run(
    cfg: Optional[Config] = None,
    single_tile: Optional[Tile] = None,
    mock: bool = False,
) -> RunStats:
    """Run full ingestion job (or a single tile when single_tile is provided).

    Pass mock=True to use synthetic data instead of real API calls — useful for
    testing the full pipeline (matching, aggregation, DB writes) without API keys.
    """
    if cfg is None:
        cfg = load_config()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    conn = _connect()
    if mock:
        fetchers = [MockFetcher(cfg, "mock_zillow"), MockFetcher(cfg, "mock_streeteasy")]
        logger.info("Running in MOCK mode — synthetic listings will be generated")
    else:
        fetchers = [ZillowFetcher(cfg), StreetEasyFetcher(cfg)]
    matcher = BuildingMatcher(conn, cfg)
    stats = RunStats()

    tiles = [single_tile] if single_tile else generate_tiles(cfg)
    random.shuffle(tiles)  # randomise access order to avoid predictable crawl patterns

    logger.info(f"Starting listing ingestion: {len(tiles)} tiles, sources={[f.source for f in fetchers]}")

    for i, tile in enumerate(tiles):
        _process_tile(tile, fetchers, matcher, conn, cfg, stats)

        if (i + 1) % 100 == 0:
            logger.info(f"Progress {i+1}/{len(tiles)}: {stats}")

        # Small random sleep between tiles to avoid predictable cadence
        time.sleep(random.uniform(0.05, 0.25))

    logger.info("Updating building listing signals …")
    update_building_signals(conn, cfg)

    conn.close()

    if not mock:
        PlaywrightBrowser.close_instance()

    logger.info(f"Run complete: {stats}")
    return stats
