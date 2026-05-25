"""Load and expose typed config from config.yaml."""
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml


@dataclass
class NycBbox:
    west: float
    east: float
    south: float
    north: float


@dataclass
class Config:
    tile_size: float
    rate_limit_rps: float
    matching_radius_meters: int
    freshness_hours: int
    max_retries: int
    backoff_base: float
    raw_log_sample_rate: float
    nyc_bbox: NycBbox
    rapidapi_key: str = field(default="")


def load_config(path: Optional[str] = None) -> Config:
    p = Path(path) if path else Path(__file__).parent / "config.yaml"
    with p.open() as f:
        data = yaml.safe_load(f)
    bbox_data = data.pop("nyc_bbox")
    cfg = Config(nyc_bbox=NycBbox(**bbox_data), **data)
    # env var overrides yaml value
    cfg.rapidapi_key = os.environ.get("RAPIDAPI_KEY", cfg.rapidapi_key or "")
    return cfg
