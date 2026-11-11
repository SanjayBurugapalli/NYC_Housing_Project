"""Replace the NaN values the ingest scripts stored with NULL

pandas holds a missing value as NaN, and `astype(str)` turns that into the
text "nan". PLUTO's ingest passed NaN straight to Postgres, so 533 buildings
had NaN coordinates (and a POINT(NaN NaN) geometry), which failed the building
detail endpoint with a 500, plus "NaN" text in other columns. pull_nta.py's
nearest-NTA fallback then put every one of those points in Greenpoint. Older DOB and
litigation pulls left "nan" text the same way. The ingests now write NULL;
this clears the rows already loaded.

Neighborhood aggregates follow: the "NaN-<BOROUGH>" rows grouped buildings
with no community district, and a NaN coordinate made the whole district's
AVG centroid NaN, dropping it from the low-zoom map.

Data only. The downgrade is a no-op: NULL is the correct value.

Revision ID: 010
Revises: 009
Create Date: 2026-11-11
"""
from typing import Sequence, Union

from alembic import op

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Every column pull_pluto.py writes that could hold NaN, in one pass.
    op.execute("""
        UPDATE buildings SET
            latitude = NULLIF(latitude, 'NaN'),
            longitude = NULLIF(longitude, 'NaN'),
            num_floors = NULLIF(num_floors, 'NaN'),
            lot_area = NULLIF(lot_area, 'NaN'),
            building_area = NULLIF(building_area, 'NaN'),
            house_number = CASE WHEN house_number IN ('NaN', 'nan') THEN NULL ELSE house_number END,
            street_name = CASE WHEN street_name IN ('NaN', 'nan') THEN NULL ELSE street_name END,
            address = CASE WHEN address IN ('NaN', 'nan') THEN NULL ELSE address END,
            zipcode = CASE WHEN zipcode IN ('NaN', 'nan') THEN NULL ELSE zipcode END,
            neighborhood = CASE WHEN neighborhood IN ('NaN', 'nan') THEN NULL ELSE neighborhood END,
            building_class = CASE WHEN building_class IN ('NaN', 'nan') THEN NULL ELSE building_class END,
            land_use = CASE WHEN land_use IN ('NaN', 'nan') THEN NULL ELSE land_use END,
            owner_name = CASE WHEN owner_name IN ('NaN', 'nan') THEN NULL ELSE owner_name END
        WHERE latitude = 'NaN' OR longitude = 'NaN' OR num_floors = 'NaN'
           OR lot_area = 'NaN' OR building_area = 'NaN'
           OR house_number IN ('NaN', 'nan') OR street_name IN ('NaN', 'nan')
           OR address IN ('NaN', 'nan') OR zipcode IN ('NaN', 'nan')
           OR neighborhood IN ('NaN', 'nan') OR building_class IN ('NaN', 'nan')
           OR land_use IN ('NaN', 'nan') OR owner_name IN ('NaN', 'nan')
    """)
    # The geometry was built from those coordinates, and the NTA from the geometry.
    op.execute("UPDATE buildings SET geom = NULL WHERE geom IS NOT NULL AND (latitude IS NULL OR longitude IS NULL)")
    op.execute("UPDATE buildings SET nta_code = NULL, nta_name = NULL WHERE geom IS NULL AND nta_name IS NOT NULL")

    op.execute("""
        UPDATE violations SET
            status = CASE WHEN status IN ('NaN', 'nan') THEN NULL ELSE status END,
            violation_type = CASE WHEN violation_type IN ('NaN', 'nan') THEN NULL ELSE violation_type END
        WHERE status IN ('NaN', 'nan') OR violation_type IN ('NaN', 'nan')
    """)
    op.execute("""
        UPDATE litigations SET
            respondent = CASE WHEN respondent IN ('NaN', 'nan') THEN NULL ELSE respondent END,
            case_type = CASE WHEN case_type IN ('NaN', 'nan') THEN NULL ELSE case_type END,
            case_status = CASE WHEN case_status IN ('NaN', 'nan') THEN NULL ELSE case_status END
        WHERE respondent IN ('NaN', 'nan') OR case_type IN ('NaN', 'nan') OR case_status IN ('NaN', 'nan')
    """)

    # Neighborhood rows are "<cd>-<BOROUGH>"; a "NaN" district isn't one.
    op.execute("DELETE FROM neighborhoods WHERE name LIKE 'NaN-%' OR name LIKE 'nan-%'")
    # Recompute the centroids a NaN coordinate poisoned, with the same
    # grouping and filters as compute.py update_neighborhood_aggregates (AVG skips NULL).
    op.execute("""
        UPDATE neighborhoods n SET
            centroid_lat = c.lat,
            centroid_lng = c.lng
        FROM (
            SELECT CONCAT(b.neighborhood, '-', b.borough) AS name,
                   AVG(b.latitude) AS lat,
                   AVG(b.longitude) AS lng
            FROM buildings b
            JOIN health_scores hs ON hs.building_id = b.id
            WHERE b.neighborhood IS NOT NULL
              AND b.building_class NOT LIKE 'A%'
              AND b.building_class NOT LIKE 'B%'
            GROUP BY b.neighborhood, b.borough
        ) c
        WHERE n.name = c.name AND (n.centroid_lat = 'NaN' OR n.centroid_lng = 'NaN')
    """)


def downgrade() -> None:
    pass
