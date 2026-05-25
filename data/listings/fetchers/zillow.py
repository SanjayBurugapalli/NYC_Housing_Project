"""Zillow fetcher using Playwright.

Strategy:
  1. A single Page is created once and reused across all tiles.
  2. For each tile we navigate to the Zillow rental search URL with the
     bounding box encoded in searchQueryState. Zillow then makes an XHR
     to GetSearchPageState.htm — we intercept that response to get clean JSON.
  3. PerimeterX is satisfied because it's a real Chromium browser with
     stealth patches and a persistent session cookie.

If the intercepted URL pattern changes, update _INTERCEPT_PATTERN.
"""
import json
import logging
import threading
from datetime import datetime, timezone
from typing import Any, Optional

from playwright.sync_api import Page, Response

from ..config import Config
from ..models import Listing
from ..tiles import Tile
from .base import BaseFetcher
from .playwright_base import PlaywrightBrowser

logger = logging.getLogger(__name__)

# Zillow's internal XHR endpoint — page triggers this on every map move/load.
_INTERCEPT_PATTERN = "**/GetSearchPageState*"
_SEARCH_BASE = "https://www.zillow.com/homes/for_rent/"


class ZillowFetcher(BaseFetcher):
    source = "zillow"

    def __init__(self, cfg: Config) -> None:
        super().__init__(cfg)
        self._page: Optional[Page] = None

    def _get_page(self) -> Page:
        if self._page is None:
            pw = PlaywrightBrowser.get_instance()
            self._page = pw.new_page()
            # Warm up: load search page once so PerimeterX session is established.
            # Use "load" — domcontentloaded can fire before PX sets its cookies.
            logger.info("Zillow: loading search page to establish session …")
            self._page.goto(_SEARCH_BASE, wait_until="load", timeout=30_000)
        return self._page

    def _build_url(self, tile: Tile) -> str:
        state = json.dumps({
            "pagination": {},
            "mapBounds": {
                "west": tile.west,
                "east": tile.east,
                "south": tile.south,
                "north": tile.north,
            },
            "filterState": {
                "isForRent": {"value": True},
                "isForSaleByAgent": {"value": False},
                "isForSaleByOwner": {"value": False},
                "isNewConstruction": {"value": False},
                "isComingSoon": {"value": False},
                "isAuction": {"value": False},
            },
            "isListVisible": True,
            "mapZoom": 15,
        })
        return f"{_SEARCH_BASE}?searchQueryState={state}"

    def _fetch_raw(self, tile: Tile) -> Any:
        page = self._get_page()

        try:
            with page.expect_response(
                lambda r: "GetSearchPageState" in r.url and r.status == 200,
                timeout=25_000,
            ) as response_info:
                page.goto(self._build_url(tile), wait_until="load", timeout=30_000)
            return response_info.value.json()
        except Exception as exc:
            # expect_response timed out — page may have loaded without triggering XHR
            # (can happen if Zillow served from cache or changed URL pattern)
            logger.warning(f"Zillow: did not capture GetSearchPageState for {tile}: {exc}")
            return {}

    def _parse(self, raw: Any) -> list[Listing]:
        if not raw:
            return []

        listings: list[Listing] = []
        now = datetime.now(tz=timezone.utc)

        try:
            results = raw["cat1"]["searchResults"]["listResults"]
        except (KeyError, TypeError):
            keys = list(raw.keys()) if isinstance(raw, dict) else type(raw).__name__
            logger.warning(f"Zillow: unexpected response shape, keys={keys}")
            return []

        for item in results:
            try:
                ll = item.get("latLong", {})
                lat, lon = ll.get("latitude"), ll.get("longitude")
                if lat is None or lon is None:
                    continue

                listings.append(Listing(
                    listing_id=str(item.get("zpid", "")),
                    source="zillow",
                    lat=float(lat),
                    lon=float(lon),
                    price=_parse_price(item.get("price") or item.get("unformattedPrice")),
                    beds=_parse_beds(item.get("beds")),
                    address=item.get("address", ""),
                    fetched_at=now,
                ))
            except Exception as exc:
                logger.debug(f"Zillow: skipping malformed item: {exc}")

        return listings


def _parse_price(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(float(str(value).replace("$", "").replace(",", "").split("/")[0].strip()))
    except (ValueError, TypeError):
        return None


def _parse_beds(value: Any) -> Optional[float]:
    try:
        return float(value) if value is not None else None
    except (ValueError, TypeError):
        return None
