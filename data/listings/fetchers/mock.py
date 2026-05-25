"""Mock fetcher that generates synthetic listings for pipeline testing.

Generates ~5-15 fake listings per tile positioned near the tile centre,
using coordinates that will hit real buildings already in the DB.
"""
import random
from datetime import datetime, timezone

from ..config import Config
from ..models import Listing
from ..tiles import Tile
from .base import BaseFetcher


class MockFetcher(BaseFetcher):
    source = "mock"

    def __init__(self, cfg: Config, source_label: str = "mock") -> None:
        super().__init__(cfg)
        self.source = source_label

    def _fetch_raw(self, tile: Tile) -> list[dict]:
        now = datetime.now(tz=timezone.utc)
        count = random.randint(3, 12)
        results = []
        for i in range(count):
            lat = random.uniform(tile.south, tile.north)
            lon = random.uniform(tile.west, tile.east)
            beds = random.choice([0, 1, 1, 2, 2, 3])
            base_price = 1500 + beds * 600 + random.randint(-300, 800)
            results.append({
                "id": f"{self.source}_{lat:.5f}_{lon:.5f}_{i}",
                "latitude": lat,
                "longitude": lon,
                "price": base_price,
                "bedrooms": beds,
                "address": f"{random.randint(100, 999)} Mock St, New York, NY",
                "fetched_at": now.isoformat(),
            })
        return results

    def _parse(self, raw: list[dict]) -> list[Listing]:
        now = datetime.now(tz=timezone.utc)
        listings = []
        for item in raw:
            listings.append(Listing(
                listing_id=item["id"],
                source=self.source,
                lat=item["latitude"],
                lon=item["longitude"],
                price=item["price"],
                beds=float(item["bedrooms"]),
                address=item["address"],
                fetched_at=now,
            ))
        return listings
