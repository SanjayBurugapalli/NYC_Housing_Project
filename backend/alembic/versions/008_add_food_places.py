"""Add food_places (delis, groceries, restaurants) + owner_name lookup index

food_places backs the "Food nearby" layer: restaurants from DOHMH restaurant
inspections and delis/groceries from NY State's retail food store licenses,
each with an estimated price tier. The GIST index is on geom::geography so the
radius query (ST_DWithin on geography, in meters) can use it directly.

The lower(owner_name) index serves the building panel's owner-portfolio
summary ("owns 6 buildings · average grade D") and the owner search, which both
match LOWER(owner_name) = LOWER(:owner).

Revision ID: 008
Revises: 007
Create Date: 2026-11-10
"""
from typing import Sequence, Union

import geoalchemy2
import sqlalchemy as sa
from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "food_places",
        sa.Column("id", sa.String(40), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("subtype", sa.String(80), nullable=True),
        sa.Column("price_tier", sa.SmallInteger(), nullable=True),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("address", sa.String(200), nullable=True),
        sa.Column("borough", sa.String(20), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column(
            "geom",
            geoalchemy2.Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("category IN ('deli', 'grocery', 'restaurant')", name="ck_food_places_category"),
        sa.CheckConstraint("price_tier BETWEEN 1 AND 3", name="ck_food_places_price_tier"),
    )
    op.execute(
        "CREATE INDEX idx_food_places_geog ON food_places USING GIST ((geom::geography))"
    )
    op.create_index("idx_food_places_source", "food_places", ["source"])
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_buildings_owner_name_lower ON buildings (lower(owner_name))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_buildings_owner_name_lower")
    op.drop_index("idx_food_places_source", table_name="food_places")
    op.execute("DROP INDEX IF EXISTS idx_food_places_geog")
    op.drop_table("food_places")
