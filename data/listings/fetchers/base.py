"""Abstract base fetcher with rate limiting, retry, and raw response sampling."""
import logging
import random
import time
from abc import ABC, abstractmethod
from typing import Any, Callable, Optional

import requests

from ..config import Config
from ..models import Listing
from ..tiles import Tile

logger = logging.getLogger(__name__)

# Module-level rate limiter state (single-threaded use)
_last_request_time: float = 0.0


def _rate_limit(rps: float) -> None:
    global _last_request_time
    min_interval = 1.0 / rps
    elapsed = time.monotonic() - _last_request_time
    if elapsed < min_interval:
        time.sleep(min_interval - elapsed + random.uniform(0, 0.15))
    _last_request_time = time.monotonic()


class BaseFetcher(ABC):
    source: str

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        })

    def fetch_tile(
        self,
        tile: Tile,
        raw_logger: Optional[Callable[[str, Any], None]] = None,
    ) -> list[Listing]:
        """Fetch listings for one tile with retry + backoff. Returns [] on persistent failure."""
        for attempt in range(self.cfg.max_retries):
            try:
                _rate_limit(self.cfg.rate_limit_rps)
                raw = self._fetch_raw(tile)

                # Sampled raw response logging for debugging
                if raw_logger and random.random() < self.cfg.raw_log_sample_rate:
                    try:
                        raw_logger(self.source, raw)
                    except Exception:
                        pass  # never let logging break ingestion

                return self._parse(raw)

            except requests.exceptions.HTTPError as exc:
                status = exc.response.status_code if exc.response is not None else 0
                if status in (429, 503):
                    wait = self.cfg.backoff_base ** attempt + random.uniform(1, 3)
                    logger.warning(
                        f"{self.source}: rate-limited (HTTP {status}), "
                        f"attempt {attempt + 1}/{self.cfg.max_retries}, sleeping {wait:.1f}s"
                    )
                    time.sleep(wait)
                else:
                    logger.warning(f"{self.source}: HTTP {status} on {tile}, giving up")
                    break

            except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
                wait = self.cfg.backoff_base ** attempt + random.uniform(0, 1)
                logger.warning(
                    f"{self.source}: network error on attempt {attempt + 1}/{self.cfg.max_retries} "
                    f"for {tile}: {exc}, retrying in {wait:.1f}s"
                )
                time.sleep(wait)

            except Exception as exc:
                logger.error(f"{self.source}: unexpected error fetching {tile}: {exc}")
                break

        return []

    @abstractmethod
    def _fetch_raw(self, tile: Tile) -> Any:
        """Make the HTTP request and return parsed JSON."""
        ...

    @abstractmethod
    def _parse(self, raw: Any) -> list[Listing]:
        """Extract Listing objects from the raw JSON response."""
        ...
