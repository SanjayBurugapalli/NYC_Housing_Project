"""Build grade-colored building outlines as a PMTiles archive (and optionally publish it).

The map's street-level view fills each residential building's real outline in
its health-grade color. Outlines come from the city's building footprints
dataset (Socrata 5zhs-2jue, ~1.08M polygons); each is tagged with its tax lot
(`mappluto_bbl`), which joins straight to `buildings.bbl` for the grade and the
filter fields the map already uses (borough, building class, units, year).

Nothing is stored in Postgres — the footprints stream from Socrata into a
newline-delimited GeoJSON file, tippecanoe tiles it, and the archive is
uploaded to Vercel Blob next to buildings.pmtiles (stable name
`footprints.pmtiles`, so NEXT_PUBLIC_FOOTPRINTS_URL never changes). Grades are
baked in, so rerun this after rescoring to keep the outlines current.

Only real buildings are kept (feature codes 2100 "Building" and 5100 "Building
under construction"); garages and sheds would otherwise be painted with their
lot's grade. Lots with no health score are left out rather than shown as F.

Usage:
    DATABASE_URL=... python data/publish_footprints.py --no-upload        # local file only
    DATABASE_URL=... BLOB_READ_WRITE_TOKEN=... python data/publish_footprints.py
    python data/publish_footprints.py --no-upload --limit 20000           # smoke test

Requires on PATH: tippecanoe (felt fork, which writes .pmtiles directly). In
production it's installed in Dockerfile.cron.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import text

# data/ingest is a flat script directory; reuse its Socrata + DB helpers.
sys.path.insert(0, str(Path(__file__).resolve().parent / "ingest"))
from base import get_db_engine, paginate_socrata  # noqa: E402

from publish_tiles import upload_to_blob  # noqa: E402

logger = logging.getLogger(__name__)

ENDPOINT = "5zhs-2jue"
BUILDING_CODES = ("2100", "5100")

REPO_ROOT = Path(__file__).resolve().parent.parent
TILES_DIR = REPO_ROOT / "tiles"
GEOJSON_PATH = TILES_DIR / "footprints.geojson"
BLOB_PATHNAME = "footprints.pmtiles"
PMTILES_PATH = TILES_DIR / BLOB_PATHNAME


# Mirrors score_to_grade() in backend/app/services/building_service.py.
def _grade(score: float) -> str:
    if score >= 97:
        return "A"
    if score >= 90:
        return "B"
    if score >= 75:
        return "C"
    if score >= 55:
        return "D"
    return "F"


def load_lots() -> dict[str, dict]:
    """bbl → the properties each outline on that lot carries (scored lots only)."""
    engine = get_db_engine()
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT b.bbl, b.address, b.borough, b.building_class, b.residential_units,
                   b.year_built, hs.composite_score
            FROM buildings b
            JOIN health_scores hs ON hs.building_id = b.id
            WHERE hs.composite_score IS NOT NULL
        """))
        lots = {}
        for r in rows:
            score = float(r.composite_score)
            lots[r.bbl] = {
                "bbl": r.bbl,
                # Grade from the unrounded score, as tiles/generate.sh does for the dots.
                "grade": _grade(score),
                # Two decimals: at one, 62.47 → 62.5 would display as 63 while
                # the building card (unrounded score) shows 62.
                "health_score": round(score, 2),
                "address": r.address,
                "borough": r.borough,
                "building_class": r.building_class,
                "residential_units": r.residential_units,
                "year_built": r.year_built or None,
            }
    logger.info("Loaded %d scored lots", len(lots))
    return lots


def _round_coords(coords):
    """Round nested coordinate arrays to 6 decimals (~10 cm) to keep tiles small."""
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], 6), round(coords[1], 6)]
    return [_round_coords(c) for c in coords]


def write_geojson(lots: dict[str, dict], limit: int | None) -> tuple[int, int]:
    """Stream footprints from Socrata into newline-delimited GeoJSON. Returns (written, skipped)."""
    TILES_DIR.mkdir(exist_ok=True)
    written = skipped = 0
    codes = ", ".join(f"'{c}'" for c in BUILDING_CODES)
    with GEOJSON_PATH.open("w", encoding="utf-8") as out:
        for page in paginate_socrata(
            ENDPOINT,
            select="mappluto_bbl, the_geom",
            where=f"feature_code in ({codes})",
            limit=limit,
        ):
            for r in page:
                props = lots.get(str(r.get("mappluto_bbl") or "").split(".")[0])
                geom = r.get("the_geom")
                if props is None or not geom or not geom.get("coordinates"):
                    skipped += 1
                    continue
                feature = {
                    "type": "Feature",
                    "properties": props,
                    "geometry": {"type": geom["type"], "coordinates": _round_coords(geom["coordinates"])},
                }
                out.write(json.dumps(feature, separators=(",", ":")))
                out.write("\n")
                written += 1
            logger.info("Footprints: %d written, %d skipped so far", written, skipped)
    return written, skipped


def build_pmtiles() -> Path:
    """Tile the outlines for street-level zooms only (the map shows them from z15).

    Every building must stay (a dropped polygon is a visible hole in a block),
    so tippecanoe is told not to drop features; light simplification keeps the
    dense Manhattan tiles reasonable instead.
    """
    subprocess.run(
        [
            "tippecanoe",
            "-o", str(PMTILES_PATH),
            "-Z", "15", "-z", "16",
            "--layer=footprints",
            "--name=BeforeYouRent building outlines",
            "--description=NYC residential building footprints colored by health grade",
            "--no-feature-limit",
            "--no-tile-size-limit",
            "--simplification=2",
            "--read-parallel",
            "--force",
            str(GEOJSON_PATH),
        ],
        check=True,
    )
    return PMTILES_PATH


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--no-upload", action="store_true", help="build tiles/footprints.pmtiles only")
    parser.add_argument("--limit", type=int, default=None, help="cap footprints fetched (smoke test)")
    args = parser.parse_args()

    lots = load_lots()
    written, skipped = write_geojson(lots, args.limit)
    logger.info("Footprints: %d written, %d skipped (non-residential, unscored or no geometry)", written, skipped)
    path = build_pmtiles()
    size = path.stat().st_size
    logger.info("Built %s (%.1f MB)", path, size / 1e6)
    GEOJSON_PATH.unlink(missing_ok=True)

    if not args.no_upload:
        token = os.environ.get("BLOB_READ_WRITE_TOKEN")
        if not token:
            raise RuntimeError("BLOB_READ_WRITE_TOKEN not set; rerun with --no-upload for a local build.")
        upload_to_blob(path, token, pathname=BLOB_PATHNAME)


if __name__ == "__main__":
    main()
