"""StreetEasy fetcher using Playwright.

Strategy:
  1. A single Page is created once and reused across tiles.
  2. For each tile we navigate to the StreetEasy rental map URL and intercept
     any XHR response that looks like a listing collection (contains a
     "listings" key with a list value).
  3. PerimeterX session is maintained across navigations.

StreetEasy's internal XHR pattern is less stable than Zillow's — the broad
response sniffer (_is_listing_response) insulates us from exact URL changes.
If results stop coming in, check _INTERCEPT_PATTERN or _is_listing_response.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlencode

from playwright.sync_api import Page, Response  # Response used in _is_listing_xhr closure

from ..config import Config
from ..models import Listing
from ..tiles import Tile
from .base import BaseFetcher
from .playwright_base import PlaywrightBrowser

logger = logging.getLogger(__name__)

_SEARCH_BASE = "https://streeteasy.com/for-rent/nyc"
# Intercept any XHR that looks like a listing search response
_INTERCEPT_HOSTS = ("streeteasy.com",)


def _is_listing_response(data: Any) -> bool:
    """Return True if the JSON payload looks like a listing search result."""
    return (
        isinstance(data, dict)
        and isinstance(data.get("listings"), list)
        and len(data["listings"]) > 0
    )


class StreetEasyFetcher(BaseFetcher):
    source = "streeteasy"

    def __init__(self, cfg: Config) -> None:
        super().__init__(cfg)
        self._page: Optional[Page] = None

    def _get_page(self) -> Page:
        if self._page is None:
            pw = PlaywrightBrowser.get_instance()
            self._page = pw.new_page()
            logger.info("StreetEasy: loading search page to establish session …")
            self._page.goto(_SEARCH_BASE, wait_until="load", timeout=30_000)
        return self._page

    def _build_url(self, tile: Tile) -> str:
        params = urlencode({
            "ne_lat": tile.north,
            "ne_lng": tile.east,
            "sw_lat": tile.south,
            "sw_lng": tile.west,
        })
        return f"{_SEARCH_BASE}?{params}"

    def _fetch_raw(self, tile: Tile) -> Any:
        page = self._get_page()

        def _is_listing_xhr(response: Response) -> bool:
            if response.status != 200:
                return False
            if "json" not in response.headers.get("content-type", ""):
                return False
            try:
                data = response.json()
                return _is_listing_response(data)
            except Exception:
                return False

        try:
            with page.expect_response(_is_listing_xhr, timeout=25_000) as response_info:
                page.goto(self._build_url(tile), wait_until="load", timeout=30_000)
            return response_info.value.json()
        except Exception as exc:
            logger.warning(f"StreetEasy: no listing XHR captured for {tile}: {exc}")
            return {}

    def _parse(self, raw: Any) -> list[Listing]:
        if not raw:
            return []

        listings: list[Listing] = []
        now = datetime.now(tz=timezone.utc)

        results = raw.get("listings", [])
        if not isinstance(results, list):
            logger.warning("StreetEasy: 'listings' field is not a list")
            return []

        for item in results:
            try:
                lat = item.get("latitude") or item.get("lat")
                lon = item.get("longitude") or item.get("lng") or item.get("lon")
                if lat is None or lon is None:
                    continue

                price = item.get("price") or item.get("asking_price") or item.get("rent")
                beds = item.get("bedrooms") or item.get("beds")

                listings.append(Listing(
                    listing_id=str(item.get("id") or item.get("listing_id") or ""),
                    source="streeteasy",
                    lat=float(lat),
                    lon=float(lon),
                    price=int(price) if price is not None else None,
                    beds=float(beds) if beds is not None else None,
                    address=item.get("address") or item.get("full_address") or "",
                    fetched_at=now,
                ))
            except Exception as exc:
                logger.debug(f"StreetEasy: skipping malformed item: {exc}")

        return listings
