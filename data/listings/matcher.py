"""Match a listing to a building in the DB via PostGIS proximity, then address fallback."""
import logging
import re
from typing import Optional

import psycopg2

from .config import Config
from .models import Listing

logger = logging.getLogger(__name__)

_STREET_ABBREVS = {
    " STREET": " ST",
    " AVENUE": " AVE",
    " BOULEVARD": " BLVD",
    " DRIVE": " DR",
    " PLACE": " PL",
    " COURT": " CT",
    " LANE": " LN",
    " ROAD": " RD",
    " TERRACE": " TER",
    " PARKWAY": " PKWY",
    " HIGHWAY": " HWY",
    " EXPRESSWAY": " EXPY",
}

# Matches ", APT 2B" / "Unit 3" / "#4A" / "STE 100" etc.
_UNIT_RE = re.compile(
    r",?\s*(APT|UNIT|#|STE|SUITE|FL|FLOOR|RM|ROOM)\s*[\w-]+",
    flags=re.IGNORECASE,
)


def normalize_address(address: str) -> str:
    addr = address.upper().strip()
    addr = _UNIT_RE.sub("", addr)
    for long_form, short_form in _STREET_ABBREVS.items():
        addr = addr.replace(long_form, short_form)
    # Collapse extra whitespace
    return re.sub(r"\s+", " ", addr).strip()


class BuildingMatcher:
    def __init__(self, conn: psycopg2.extensions.connection, cfg: Config) -> None:
        self.conn = conn
        self.radius_m = cfg.matching_radius_meters

    def match(self, listing: Listing) -> Optional[int]:
        """Return buildings.id of nearest matched building, or None."""
        building_id = self._match_by_coords(listing.lat, listing.lon)
        if building_id is not None:
            return building_id
        return self._match_by_address(normalize_address(listing.address))

    def _match_by_coords(self, lat: float, lon: float) -> Optional[int]:
        # ST_DWithin filters by radius; KNN operator (<->) picks the closest candidate.
        sql = """
            SELECT id
            FROM buildings
            WHERE ST_DWithin(
                geom::geography,
                ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                %s
            )
            ORDER BY geom <-> ST_SetSRID(ST_MakePoint(%s, %s), 4326)
            LIMIT 1
        """
        with self.conn.cursor() as cur:
            cur.execute(sql, (lon, lat, self.radius_m, lon, lat))
            row = cur.fetchone()
        return row[0] if row else None

    def _match_by_address(self, normalized: str) -> Optional[int]:
        if not normalized:
            return None
        sql = """
            SELECT id
            FROM buildings
            WHERE upper(address) = %s
            LIMIT 1
        """
        with self.conn.cursor() as cur:
            cur.execute(sql, (normalized,))
            row = cur.fetchone()
        return row[0] if row else None
