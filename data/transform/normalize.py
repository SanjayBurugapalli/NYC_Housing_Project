"""Address normalization and BBL joining for address-keyed datasets.

Matches 311 complaints and rodent inspections to buildings by normalized address.
"""

import logging
import re
import sys
from pathlib import Path

from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ingest"))
from base import get_db_engine

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# Common address suffix standardizations
SUFFIX_MAP = {
    "STREET": "ST",
    "AVENUE": "AVE",
    "BOULEVARD": "BLVD",
    "DRIVE": "DR",
    "PLACE": "PL",
    "ROAD": "RD",
    "LANE": "LN",
    "COURT": "CT",
    "TERRACE": "TER",
    "PARKWAY": "PKWY",
    "HIGHWAY": "HWY",
    "CIRCLE": "CIR",
    "EAST": "E",
    "WEST": "W",
    "NORTH": "N",
    "SOUTH": "S",
}


def normalize_address(address: str | None) -> str | None:
    """Normalize a NYC street address for matching."""
    if not address:
        return None

    addr = address.upper().strip()

    # Remove apartment/unit numbers
    addr = re.sub(r"\s*(APT|UNIT|SUITE|STE|FL|FLOOR|RM|ROOM)\s*[#.]?\s*\S*", "", addr)

    # Remove # signs
    addr = addr.replace("#", "")

    # Standardize suffixes
    words = addr.split()
    normalized_words = [SUFFIX_MAP.get(w, w) for w in words]
    addr = " ".join(normalized_words)

    # Remove extra whitespace
    addr = re.sub(r"\s+", " ", addr).strip()

    return addr


def match_complaints_to_buildings():
    """Match 311 complaints to buildings by normalized address + borough."""
    engine = get_db_engine()

    logger.info("Matching 311 complaints to buildings by address...")

    with engine.begin() as conn:
        # Update complaints that have an address but no building_id
        result = conn.execute(
            text("""
                UPDATE complaints c
                SET building_id = b.id,
                    bbl = b.bbl
                FROM buildings b
                WHERE c.building_id IS NULL
                    AND c.source = '311'
                    AND c.address IS NOT NULL
                    AND UPPER(TRIM(c.address)) = UPPER(TRIM(b.address))
                    AND c.borough = b.borough
            """)
        )
        logger.info(f"Matched {result.rowcount} 311 complaints by exact address")

    logger.info("311 complaint matching complete")


def match_violations_to_buildings():
    """Match DOB violations/complaints to buildings by BIN."""
    engine = get_db_engine()

    logger.info("Matching DOB data to buildings by BIN...")

    with engine.begin() as conn:
        # Match violations by BIN
        result = conn.execute(
            text("""
                UPDATE violations v
                SET building_id = b.id,
                    bbl = b.bbl
                FROM buildings b
                WHERE v.building_id IS NULL
                    AND v.source = 'DOB'
                    AND v.bin IS NOT NULL
                    AND v.bin = b.bin
            """)
        )
        logger.info(f"Matched {result.rowcount} DOB violations by BIN")

        # Match complaints by BIN
        result = conn.execute(
            text("""
                UPDATE complaints c
                SET building_id = b.id,
                    bbl = b.bbl
                FROM buildings b
                WHERE c.building_id IS NULL
                    AND c.source = 'DOB'
                    AND c.bin IS NOT NULL
                    AND c.bin = b.bin
            """)
        )
        logger.info(f"Matched {result.rowcount} DOB complaints by BIN")


def match_hpd_to_buildings():
    """Match HPD complaints/violations to buildings by BBL."""
    engine = get_db_engine()

    logger.info("Matching HPD data to buildings by BBL...")

    with engine.begin() as conn:
        # Match violations by BBL
        result = conn.execute(
            text("""
                UPDATE violations v
                SET building_id = b.id
                FROM buildings b
                WHERE v.building_id IS NULL
                    AND v.source = 'HPD'
                    AND v.bbl IS NOT NULL
                    AND v.bbl = b.bbl
            """)
        )
        logger.info(f"Matched {result.rowcount} HPD violations by BBL")

        # Match complaints by BBL
        result = conn.execute(
            text("""
                UPDATE complaints c
                SET building_id = b.id
                FROM buildings b
                WHERE c.building_id IS NULL
                    AND c.source = 'HPD'
                    AND c.bbl IS NOT NULL
                    AND c.bbl = b.bbl
            """)
        )
        logger.info(f"Matched {result.rowcount} HPD complaints by BBL")


def match_litigations_to_buildings():
    """Match litigations to buildings by BBL."""
    engine = get_db_engine()

    logger.info("Matching litigations to buildings by BBL...")

    with engine.begin() as conn:
        result = conn.execute(
            text("""
                UPDATE litigations l
                SET building_id = b.id
                FROM buildings b
                WHERE l.building_id IS NULL
                    AND l.bbl IS NOT NULL
                    AND l.bbl = b.bbl
            """)
        )
        logger.info(f"Matched {result.rowcount} litigations by BBL")


def match_rodent_to_buildings():
    """Match rodent inspections to buildings by BBL or address."""
    engine = get_db_engine()

    logger.info("Matching rodent inspections to buildings...")

    with engine.begin() as conn:
        # First try BBL match
        result = conn.execute(
            text("""
                UPDATE rodent_inspections r
                SET bbl = b.bbl
                FROM buildings b
                WHERE r.bbl IS NULL
                    AND r.address IS NOT NULL
                    AND UPPER(TRIM(r.address)) = UPPER(TRIM(b.address))
                    AND r.borough = b.borough
            """)
        )
        logger.info(f"Matched {result.rowcount} rodent inspections by address")


def run_all_matching():
    """Run all data matching steps."""
    logger.info("Starting data normalization and matching...")
    match_hpd_to_buildings()
    match_violations_to_buildings()
    match_complaints_to_buildings()
    match_litigations_to_buildings()
    match_rodent_to_buildings()
    logger.info("All matching complete")


if __name__ == "__main__":
    run_all_matching()
