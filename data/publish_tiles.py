"""Regenerate the building vector tiles and publish them to Vercel Blob.

The map streams high-zoom building dots from a static PMTiles archive on Vercel
Blob (see frontend NEXT_PUBLIC_TILES_URL). That archive is a snapshot — it does
not change when the nightly refresh recomputes scores. This module rebuilds it
from the current `buildings` + `health_scores` and re-uploads it, so the dots on
the map track the freshly computed grades.

The archive is written to a STABLE object name (`buildings.pmtiles`), overwriting
the previous run, so the public URL — and thus NEXT_PUBLIC_TILES_URL — never
changes and the frontend needs no redeploy.

Run as the final step of data/refresh.py, or standalone:

    BLOB_READ_WRITE_TOKEN=... DATABASE_URL=... python data/publish_tiles.py

Requires on PATH: ogr2ogr (gdal-bin), tippecanoe, pmtiles. In production these
are installed in Dockerfile.cron; locally they come from Homebrew.
"""
from __future__ import annotations

import logging
import os
import subprocess
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

# Stable object name in the Blob store. Overwritten every run so the public URL
# (and NEXT_PUBLIC_TILES_URL) stays constant.
BLOB_PATHNAME = "buildings.pmtiles"
BLOB_API_BASE = "https://blob.vercel-storage.com"
# The archive updates nightly at a STABLE url. Vercel Blob otherwise defaults to
# a ~30-day cache, which would keep serving last month's tiles from the edge/
# browser. Cap caching at 1h so a nightly update is visible within the hour.
TILE_CACHE_MAX_AGE = 3600

REPO_ROOT = Path(__file__).resolve().parent.parent
GENERATE_SCRIPT = REPO_ROOT / "tiles" / "generate.sh"
PMTILES_PATH = REPO_ROOT / "tiles" / BLOB_PATHNAME


def _db_url() -> str:
    """The sync (libpq-friendly) DB URL, falling back to the async one.

    generate.sh strips any `+asyncpg` suffix and URL-decodes the password, so
    either form works; the sync URL is preferred since it's already plain libpq.
    """
    url = os.environ.get("DATABASE_URL_SYNC") or os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "Neither DATABASE_URL_SYNC nor DATABASE_URL is set; cannot generate tiles."
        )
    return url


def regenerate_pmtiles() -> Path:
    """Run tiles/generate.sh to (re)build tiles/buildings.pmtiles. Returns its path."""
    if not GENERATE_SCRIPT.exists():
        raise FileNotFoundError(f"Tile script missing: {GENERATE_SCRIPT}")

    env = os.environ.copy()
    env["OUTPUT_FORMAT"] = "pmtiles"
    env["DATABASE_URL"] = _db_url()  # generate.sh parses + URL-decodes this

    logger.info("Regenerating vector tiles via %s", GENERATE_SCRIPT)
    subprocess.run(["bash", str(GENERATE_SCRIPT)], cwd=str(REPO_ROOT), env=env, check=True)

    if not PMTILES_PATH.exists():
        raise FileNotFoundError(f"generate.sh did not produce {PMTILES_PATH}")
    return PMTILES_PATH


def upload_to_blob(path: Path, token: str, pathname: str = BLOB_PATHNAME) -> str:
    """Upload `path` to Vercel Blob at `pathname` (overwriting). Returns the public URL."""
    data = path.read_bytes()
    resp = httpx.put(
        f"{BLOB_API_BASE}/{pathname}",
        content=data,
        headers={
            "authorization": f"Bearer {token}",
            "x-content-type": "application/octet-stream",
            "x-vercel-blob-access": "public",   # served at a public URL the map fetches
            "x-add-random-suffix": "0",         # keep the stable pathname
            "x-allow-overwrite": "1",           # replace the previous run's archive
            "x-cache-control-max-age": str(TILE_CACHE_MAX_AGE),
        },
        timeout=180.0,
    )
    if resp.status_code // 100 != 2:
        raise RuntimeError(
            f"Blob upload failed: HTTP {resp.status_code} {resp.text[:500]}"
        )
    url = resp.json().get("url", "")
    logger.info("Uploaded %s (%d bytes) -> %s", pathname, len(data), url)
    return url


def publish() -> int:
    """Regenerate the tiles and upload them to Blob. Returns the uploaded byte size.

    Raises if BLOB_READ_WRITE_TOKEN is unset — callers that may run without it
    (e.g. local refresh) should check for the token before invoking this.
    """
    token = os.environ.get("BLOB_READ_WRITE_TOKEN")
    if not token:
        raise RuntimeError("BLOB_READ_WRITE_TOKEN not set; cannot publish tiles.")

    path = regenerate_pmtiles()
    size = path.stat().st_size
    upload_to_blob(path, token)
    return size


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    size = publish()
    logger.info("Tile publish complete: %d bytes", size)


if __name__ == "__main__":
    main()
