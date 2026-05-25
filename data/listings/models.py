"""Core data models for the listings pipeline."""
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class Listing:
    listing_id: str
    source: str          # "zillow" or "streeteasy"
    lat: float
    lon: float
    price: Optional[int]
    beds: Optional[float]
    address: str
    fetched_at: datetime
