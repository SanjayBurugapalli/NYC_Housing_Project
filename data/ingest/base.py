"""Shared utilities for data ingestion scripts."""

import os
import sys
from pathlib import Path

from sodapy import Socrata
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add backend to path for model imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "backend"))

import pandas as pd


def clean_row_for_sql(row_dict: dict) -> dict:
    """Convert pandas NaT/NaN to None for SQL insertion."""
    return {k: (None if pd.isna(v) else v) for k, v in row_dict.items()}


SOCRATA_DOMAIN = "data.cityofnewyork.us"
SOCRATA_APP_TOKEN = os.environ.get("SOCRATA_APP_TOKEN")

# Sync database URL for ingestion scripts
DATABASE_URL = os.environ.get(
    "DATABASE_URL_SYNC",
    os.environ.get("DATABASE_URL", "postgresql://nyc_buildings:devpassword@localhost:5432/nyc_buildings"),
)
# Strip async driver prefix if present
if "+asyncpg" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("+asyncpg", "")


def get_socrata_client() -> Socrata:
    """Create a Socrata API client."""
    return Socrata(SOCRATA_DOMAIN, SOCRATA_APP_TOKEN, timeout=120)


def get_db_engine():
    """Create a sync SQLAlchemy engine for data ingestion."""
    return create_engine(DATABASE_URL, echo=False)


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
