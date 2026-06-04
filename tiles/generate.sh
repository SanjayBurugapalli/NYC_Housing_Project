#!/bin/bash
# Generate vector tiles from building health-score data.
#
# Produces a tileset whose `buildings` layer carries the same feature
# properties the map already renders from the API GeoJSON path
# (bbl, grade, health_score, building_class, …), so the frontend can switch
# its high-zoom `buildings` source from GeoJSON to vector tiles with no schema
# change. The grade is baked in here (matching score_to_grade in
# backend/app/services/building_service.py) so Mapbox can color dots client-side
# from a single `grade` attribute.
#
# Prerequisites:
#   - GDAL (ogr2ogr) and tippecanoe on PATH
#   - pmtiles CLI on PATH only if OUTPUT_FORMAT=pmtiles (see below)
#   - A populated buildings + health_scores database
#
# Connection: set DATABASE_URL (postgres://user:pass@host:port/db) OR the
# individual PG* parts. DATABASE_URL takes precedence and is parsed below.
#
# Usage:
#   ./tiles/generate.sh                       # mbtiles, default DB
#   OUTPUT_FORMAT=pmtiles ./tiles/generate.sh # also emit buildings.pmtiles
#
set -euo pipefail

OUTPUT_DIR="${OUTPUT_DIR:-tiles}"
OUTPUT_FORMAT="${OUTPUT_FORMAT:-mbtiles}"   # mbtiles | pmtiles

# Decode %XX escapes in a URL-encoded URI component (e.g. a password with
# special chars). Does NOT treat '+' as space — that's form-encoding, which is
# invalid for a URI userinfo component. Plain strings pass through unchanged.
urldecode() {
    printf '%b' "${1//%/\\x}"
}

# --- Resolve DB connection -------------------------------------------------
# Prefer DATABASE_URL; strip any +asyncpg driver suffix the backend uses.
if [[ -n "${DATABASE_URL:-}" ]]; then
    url="${DATABASE_URL/+asyncpg/}"
    # postgres://user:pass@host:port/dbname  -> parts
    proto_removed="${url#*://}"
    creds="${proto_removed%@*}"
    hostpart="${proto_removed#*@}"
    DB_USER="${creds%%:*}"
    DB_PASS="${creds#*:}"; [[ "$DB_PASS" == "$creds" ]] && DB_PASS=""
    # Credentials in DATABASE_URL are URL-encoded; decode %XX so passwords with
    # special characters (e.g. ';' written as %3B) authenticate correctly.
    DB_USER="$(urldecode "$DB_USER")"
    DB_PASS="$(urldecode "$DB_PASS")"
    hostport="${hostpart%%/*}"
    DB_HOST="${hostport%%:*}"
    DB_PORT="${hostport#*:}"; [[ "$DB_PORT" == "$hostport" ]] && DB_PORT=5432
    DB_NAME="${hostpart#*/}"; DB_NAME="${DB_NAME%%\?*}"
else
    DB_NAME="${PGDATABASE:-nyc_buildings}"
    DB_USER="${PGUSER:-nyc_buildings}"
    DB_HOST="${PGHOST:-localhost}"
    DB_PORT="${PGPORT:-5432}"
    DB_PASS="${PGPASSWORD:-}"
fi
export PGPASSWORD="${DB_PASS}"

GEOJSON_FILE="${OUTPUT_DIR}/buildings.geojson"
MBTILES_FILE="${OUTPUT_DIR}/buildings.mbtiles"
PMTILES_FILE="${OUTPUT_DIR}/buildings.pmtiles"

mkdir -p "${OUTPUT_DIR}"

echo "=== BeforeYouRent — Tile Generation (db=${DB_NAME}@${DB_HOST}:${DB_PORT}) ==="

# Step 1: Export buildings with scores + baked-in grade to GeoJSON.
# Grade thresholds mirror score_to_grade(): A>=97 B>=90 C>=75 D>=55 else F.
echo "[1/3] Exporting buildings to GeoJSON..."
ogr2ogr -f GeoJSON "${GEOJSON_FILE}" \
    PG:"dbname=${DB_NAME} user=${DB_USER} host=${DB_HOST} port=${DB_PORT}" \
    -sql "
        SELECT
            b.bbl,
            b.address,
            b.borough,
            b.neighborhood,
            b.building_class,
            b.residential_units,
            b.year_built,
            ROUND(COALESCE(hs.composite_score, 0)::numeric, 1) AS health_score,
            CASE
                WHEN COALESCE(hs.composite_score, 0) >= 97 THEN 'A'
                WHEN COALESCE(hs.composite_score, 0) >= 90 THEN 'B'
                WHEN COALESCE(hs.composite_score, 0) >= 75 THEN 'C'
                WHEN COALESCE(hs.composite_score, 0) >= 55 THEN 'D'
                ELSE 'F'
            END AS grade,
            b.geom
        FROM buildings b
        LEFT JOIN health_scores hs ON hs.building_id = b.id
        WHERE b.geom IS NOT NULL
    " \
    -t_srs EPSG:4326

echo "  Exported $(wc -l < "${GEOJSON_FILE}") lines"

# Step 2: Generate vector tiles.
#   -Z 13 matches the frontend buildings-dots layer minzoom (below z13 the map
#   shows neighborhood bubbles, not individual buildings, so tiling lower zooms
#   just bloats the tileset).
#   --drop-densest-as-needed + --coalesce-densest keeps dense Manhattan tiles
#   under the size limit while preferring to keep lower-scoring (more relevant)
#   buildings via -j feature-filtering is intentionally NOT used so every
#   building stays clickable; density management is left to tippecanoe.
echo "[2/3] Generating vector tiles..."
tippecanoe \
    -o "${MBTILES_FILE}" \
    -Z 13 -z 16 \
    --name="BeforeYouRent Building Health Scores" \
    --description="NYC residential building health scores" \
    --layer="buildings" \
    --drop-densest-as-needed \
    --coalesce-densest-as-needed \
    --extend-zooms-if-still-dropping \
    --no-tile-size-limit \
    --force \
    "${GEOJSON_FILE}"

bytes=$(stat -c%s "${MBTILES_FILE}" 2>/dev/null || stat -f%z "${MBTILES_FILE}" 2>/dev/null || echo "?")
echo "  Generated ${MBTILES_FILE} (${bytes} bytes)"

# Optional: convert to PMTiles for static CDN hosting (no tile server needed).
if [[ "${OUTPUT_FORMAT}" == "pmtiles" ]]; then
    echo "  Converting to PMTiles..."
    pmtiles convert "${MBTILES_FILE}" "${PMTILES_FILE}"
    echo "  Wrote ${PMTILES_FILE}"
fi

# Step 3: Cleanup intermediate GeoJSON.
echo "[3/3] Cleaning up..."
rm -f "${GEOJSON_FILE}"

echo "=== Done ==="
echo
echo "Hosting options (pick one, then wire the frontend 'buildings' source):"
echo "  A) Mapbox tileset:  mapbox upload <username>.byr_buildings ${MBTILES_FILE}"
echo "     Frontend: source { type:'vector', url:'mapbox://<username>.byr_buildings' }"
echo "  B) Static PMTiles:  upload ${PMTILES_FILE} to any CDN / Vercel Blob"
echo "     Frontend: pmtiles protocol + source { type:'vector', url:'pmtiles://<cdn-url>' }"
