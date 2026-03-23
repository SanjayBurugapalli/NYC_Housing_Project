#!/bin/bash
# Generate vector tiles from building health score data.
#
# Prerequisites:
#   - ogr2ogr (GDAL) installed
#   - tippecanoe installed
#   - PostgreSQL database with buildings_with_scores view or table
#
# Usage:
#   ./tiles/generate.sh [db_name] [output_dir]

set -euo pipefail

DB_NAME="${1:-nyc_buildings}"
DB_USER="${DB_USER:-nyc_buildings}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
OUTPUT_DIR="${2:-tiles}"

GEOJSON_FILE="${OUTPUT_DIR}/buildings.geojson"
MBTILES_FILE="${OUTPUT_DIR}/buildings.mbtiles"

echo "=== NYC Building Health Score — Tile Generation ==="

# Step 1: Export buildings with scores to GeoJSON
echo "[1/3] Exporting buildings to GeoJSON..."
ogr2ogr -f GeoJSON "${GEOJSON_FILE}" \
    PG:"dbname=${DB_NAME} user=${DB_USER} host=${DB_HOST} port=${DB_PORT}" \
    -sql "
        SELECT
            b.bbl,
            b.address,
            b.borough,
            b.neighborhood,
            COALESCE(hs.composite_score, 0) as health_score,
            b.residential_units,
            b.year_built,
            b.building_class,
            b.geom
        FROM buildings b
        LEFT JOIN health_scores hs ON hs.building_id = b.id
        WHERE b.geom IS NOT NULL
    " \
    -t_srs EPSG:4326

echo "  Exported $(wc -l < "${GEOJSON_FILE}") lines"

# Step 2: Generate vector tiles with tippecanoe
echo "[2/3] Generating vector tiles..."
tippecanoe \
    -o "${MBTILES_FILE}" \
    -z 16 \
    -Z 10 \
    --name="NYC Building Health Scores" \
    --description="Building health scores for NYC residential buildings" \
    --layer="buildings" \
    --drop-densest-as-needed \
    --extend-zooms-if-still-dropping \
    --minimum-detail=10 \
    --force \
    "${GEOJSON_FILE}"

echo "  Generated $(stat -f%z "${MBTILES_FILE}" 2>/dev/null || stat --printf="%s" "${MBTILES_FILE}" 2>/dev/null || echo "?") bytes"

# Step 3: Cleanup
echo "[3/3] Cleaning up..."
rm -f "${GEOJSON_FILE}"

echo "=== Done! Tiles written to ${MBTILES_FILE} ==="
echo ""
echo "To serve locally, use:"
echo "  npx tileserver-gl ${MBTILES_FILE}"
echo ""
echo "To upload to Mapbox, use:"
echo "  mapbox upload username.buildings ${MBTILES_FILE}"
