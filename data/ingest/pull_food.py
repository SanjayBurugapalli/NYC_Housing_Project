"""Pull delis, groceries and restaurants for the "Food nearby" layer.

Sources (both Socrata):
  - DOHMH Restaurant Inspection Results, data.cityofnewyork.us 43nn-pn8j
    One row per violation, so it's grouped down to one row per CAMIS
    (establishment). It covers every permitted kitchen, so never-inspected
    permits and non-public kitchens (office/school cafeterias, caterers) are
    dropped — see food_classify.is_non_public_kitchen / never_inspected.
  - NY State Retail Food Stores, data.ny.gov 9a8c-vfzj
    Ag & Markets licenses: bodegas, delis, supermarkets, specialty markets.
    Bodegas and grocers are licensed by the state, not DOHMH, so they're
    mostly absent from the restaurant data.

Each run is a full replace per source: upsert everything, then delete rows of
that source the run didn't touch (closed / delicensed places). Classification
and price tiers live in food_classify.py.

Usage:
    python data/ingest/pull_food.py            # both sources
    python data/refresh.py --datasets=food_restaurants,food_retail
"""

import logging
import re
import time
from datetime import datetime, timezone
from typing import Iterator

from sqlalchemy import text

from base import get_db_engine, get_socrata_client, normalize_borough
from food_classify import (
    classify_store,
    clean_cuisine,
    is_non_public_kitchen,
    never_inspected,
    restaurant_price_tier,
    title_name,
)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

DOHMH_DOMAIN = "data.cityofnewyork.us"
DOHMH_ENDPOINT = "43nn-pn8j"
NYS_DOMAIN = "data.ny.gov"
NYS_ENDPOINT = "9a8c-vfzj"

PAGE_SIZE = 50000
WRITE_BATCH = 5000

# Points outside this box are bad geocodes (the restaurant data has 0,0 rows).
_NYC_BOX = (-74.30, 40.45, -73.65, 40.95)

_NYS_COUNTY_BOROUGH = {
    "NEW YORK": "MANHATTAN",
    "KINGS": "BROOKLYN",
    "QUEENS": "QUEENS",
    "BRONX": "BRONX",
    "RICHMOND": "STATEN ISLAND",
}

UPSERT_SQL = text("""
    INSERT INTO food_places (
        id, name, category, subtype, price_tier, source, address, borough,
        latitude, longitude, geom, updated_at
    ) VALUES (
        :id, :name, :category, :subtype, :price_tier, :source, :address, :borough,
        :latitude, :longitude, ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326), :run_at
    )
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        subtype = EXCLUDED.subtype,
        price_tier = EXCLUDED.price_tier,
        address = EXCLUDED.address,
        borough = EXCLUDED.borough,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        geom = EXCLUDED.geom,
        updated_at = EXCLUDED.updated_at
""")


def _in_nyc(lat: float | None, lng: float | None) -> bool:
    if lat is None or lng is None:
        return False
    west, south, east, north = _NYC_BOX
    return south <= lat <= north and west <= lng <= east


def _float(value: object) -> float | None:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _address(number: str | None, street: str | None) -> str | None:
    parts = [p for p in ((number or "").strip(), " ".join((street or "").split())) if p]
    if not parts:
        return None
    # License data carries stray punctuation ("2924 AVENUE R. ###").
    cleaned = re.sub(r"[^\w\s&'/-]", " ", " ".join(parts))
    return title_name(cleaned) or None


def _fetch_pages(domain: str, endpoint: str, limit: int | None = None, **query) -> Iterator[list[dict]]:
    """Offset-paginated Socrata reads with retries.

    Grouped ($group) queries can't use the :id keyset cursor that
    paginate_socrata relies on, and both result sets here are small (~30k and
    ~11k rows), so plain offsets are fine.
    """
    client = get_socrata_client(domain=domain)
    offset = 0
    total = 0
    while True:
        page_size = PAGE_SIZE if limit is None else min(PAGE_SIZE, limit - total)
        if page_size <= 0:
            return
        for attempt in range(4):
            try:
                rows = client.get(endpoint, limit=page_size, offset=offset, **query)
                break
            except Exception as e:
                logger.warning("Socrata get failed (%s, attempt %d/4): %s", endpoint, attempt + 1, e)
                if attempt == 3:
                    raise
                time.sleep(5 * (attempt + 1))
                client = get_socrata_client(domain=domain)
        if not rows:
            return
        total += len(rows)
        yield rows
        if len(rows) < page_size:
            return
        offset += page_size


def restaurant_records(rows: list[dict]) -> list[dict]:
    """DOHMH grouped rows → food_places records (one per CAMIS, latest name wins)."""
    latest: dict[str, dict] = {}
    for r in rows:
        camis = r.get("camis")
        if not camis:
            continue
        prev = latest.get(camis)
        if prev is None or (r.get("last_seen") or "") > (prev.get("last_seen") or ""):
            latest[camis] = r

    records = []
    for camis, r in latest.items():
        lat, lng = _float(r.get("latitude")), _float(r.get("longitude"))
        name = title_name(r.get("dba"))
        if not name or not _in_nyc(lat, lng):
            continue
        # Permits that were never inspected, and kitchens that aren't open to
        # the public (office/school/hospital cafeterias, caterers), aren't
        # somewhere a renter can go eat.
        if never_inspected(r.get("last_seen")) or is_non_public_kitchen(r.get("dba")):
            continue
        cuisine = r.get("cuisine_description")
        records.append({
            "id": f"dohmh:{camis}",
            "name": name[:200],
            "category": "restaurant",
            "subtype": clean_cuisine(cuisine),
            "price_tier": restaurant_price_tier(r.get("dba"), cuisine),
            "source": "dohmh",
            "address": _address(r.get("building"), r.get("street")),
            "borough": normalize_borough(r.get("boro")),
            "latitude": lat,
            "longitude": lng,
        })
    return records


def store_records(rows: list[dict]) -> list[dict]:
    """NY State retail food store rows → deli/grocery food_places records."""
    records: dict[str, dict] = {}
    for r in rows:
        license_number = r.get("license_number")
        if not license_number or license_number in records:
            continue
        raw_name = r.get("dba_name") or r.get("entity_name")
        classified = classify_store(raw_name, r.get("square_footage"))
        if classified is None:
            continue
        coords = (r.get("georeference") or {}).get("coordinates") or []
        lng, lat = (_float(coords[0]), _float(coords[1])) if len(coords) >= 2 else (None, None)
        if not _in_nyc(lat, lng):
            continue
        category, subtype, price_tier = classified
        records[license_number] = {
            "id": f"nys:{license_number}",
            "name": title_name(raw_name)[:200],
            "category": category,
            "subtype": subtype,
            "price_tier": price_tier,
            "source": "nys",
            "address": _address(r.get("street_number"), r.get("street_name")),
            "borough": _NYS_COUNTY_BOROUGH.get((r.get("county") or "").upper()),
            "latitude": lat,
            "longitude": lng,
        }
    return list(records.values())


def _replace_source(source: str, records: list[dict], prune: bool) -> int:
    """Upsert `records`, then (on a full run) delete this source's rows not seen."""
    if not records:
        # An empty pull is far more likely an upstream hiccup than every place
        # in the city closing — refuse to wipe the table.
        raise RuntimeError(f"food_places: no {source} records fetched; leaving existing rows")

    run_at = datetime.now(timezone.utc)
    engine = get_db_engine()
    with engine.begin() as conn:
        for i in range(0, len(records), WRITE_BATCH):
            batch = [{**rec, "run_at": run_at} for rec in records[i:i + WRITE_BATCH]]
            conn.execute(UPSERT_SQL, batch)
        if prune:
            deleted = conn.execute(
                text("DELETE FROM food_places WHERE source = :source AND updated_at < :run_at"),
                {"source": source, "run_at": run_at},
            ).rowcount
            logger.info("food_places[%s]: pruned %d stale rows", source, deleted)
    logger.info("food_places[%s]: upserted %d rows", source, len(records))
    return len(records)


def pull_food_restaurants(limit: int | None = None) -> int:
    rows: list[dict] = []
    for page in _fetch_pages(
        DOHMH_DOMAIN,
        DOHMH_ENDPOINT,
        limit=limit,
        select=(
            "camis, dba, cuisine_description, boro, building, street, zipcode, "
            "latitude, longitude, max(inspection_date) AS last_seen"
        ),
        group="camis, dba, cuisine_description, boro, building, street, zipcode, latitude, longitude",
        where="latitude > 40 AND longitude < -73",
        order="camis",
    ):
        rows.extend(page)
    logger.info("DOHMH: fetched %d grouped rows", len(rows))
    # A --limit smoke test sees only part of the city, so it must not prune.
    return _replace_source("dohmh", restaurant_records(rows), prune=limit is None)


def pull_food_retail(limit: int | None = None) -> int:
    counties = ", ".join(f"'{c}'" for c in _NYS_COUNTY_BOROUGH)
    rows: list[dict] = []
    for page in _fetch_pages(
        NYS_DOMAIN,
        NYS_ENDPOINT,
        limit=limit,
        select=(
            "license_number, dba_name, entity_name, street_number, street_name, "
            "zip_code, square_footage, georeference, county"
        ),
        where=f"county in ({counties}) AND operation_type = 'Store'",
        order="license_number",
    ):
        rows.extend(page)
    logger.info("NYS retail food stores: fetched %d rows", len(rows))
    return _replace_source("nys", store_records(rows), prune=limit is None)


if __name__ == "__main__":
    pull_food_restaurants()
    pull_food_retail()
