"""Initial schema with all tables

Revision ID: 001
Revises:
Create Date: 2026-03-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import geoalchemy2

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable PostGIS
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # Buildings table
    op.create_table(
        "buildings",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("bbl", sa.String(10), nullable=False),
        sa.Column("bin", sa.String(7), nullable=True),
        sa.Column("house_number", sa.String(20), nullable=True),
        sa.Column("street_name", sa.String(100), nullable=True),
        sa.Column("borough", sa.String(20), nullable=True),
        sa.Column("zipcode", sa.String(5), nullable=True),
        sa.Column("address", sa.String(200), nullable=True),
        sa.Column("neighborhood", sa.String(100), nullable=True),
        sa.Column("residential_units", sa.Integer(), default=0, nullable=True),
        sa.Column("total_units", sa.Integer(), default=0, nullable=True),
        sa.Column("year_built", sa.Integer(), nullable=True),
        sa.Column("year_altered", sa.Integer(), nullable=True),
        sa.Column("building_class", sa.String(10), nullable=True),
        sa.Column("building_class_category", sa.String(50), nullable=True),
        sa.Column("land_use", sa.String(10), nullable=True),
        sa.Column("num_floors", sa.Float(), nullable=True),
        sa.Column("lot_area", sa.Float(), nullable=True),
        sa.Column("building_area", sa.Float(), nullable=True),
        sa.Column("owner_name", sa.String(200), nullable=True),
        sa.Column(
            "geom",
            geoalchemy2.Geometry(geometry_type="POINT", srid=4326),
            nullable=True,
        ),
        sa.Column(
            "geom_footprint",
            geoalchemy2.Geometry(geometry_type="MULTIPOLYGON", srid=4326),
            nullable=True,
        ),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bbl"),
    )
    op.create_index("idx_buildings_bbl", "buildings", ["bbl"])
    op.create_index("idx_buildings_bin", "buildings", ["bin"])
    # Note: GeoAlchemy2 auto-creates spatial index for Geometry columns
    op.create_index("idx_buildings_borough_class", "buildings", ["borough", "building_class"])
    op.create_index("idx_buildings_neighborhood", "buildings", ["neighborhood"])

    # Complaints table
    op.create_table(
        "complaints",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("external_id", sa.String(50), nullable=True),
        sa.Column("building_id", sa.BigInteger(), nullable=True),
        sa.Column("bbl", sa.String(10), nullable=True),
        sa.Column("bin", sa.String(7), nullable=True),
        sa.Column("source", sa.String(10), nullable=False),
        sa.Column("complaint_type", sa.String(100), nullable=True),
        sa.Column("descriptor", sa.String(200), nullable=True),
        sa.Column("status", sa.String(50), nullable=True),
        sa.Column("status_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("address", sa.String(200), nullable=True),
        sa.Column("borough", sa.String(20), nullable=True),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("created_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolution_days", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("external_id"),
        sa.ForeignKeyConstraint(["building_id"], ["buildings.id"]),
    )
    op.create_index("idx_complaints_building_id", "complaints", ["building_id"])
    op.create_index("idx_complaints_bbl", "complaints", ["bbl"])
    op.create_index("idx_complaints_bin", "complaints", ["bin"])
    op.create_index("idx_complaints_bbl_date", "complaints", ["bbl", "created_date"])
    op.create_index("idx_complaints_source_type", "complaints", ["source", "complaint_type"])
    op.create_index("idx_complaints_category", "complaints", ["category"])
    op.create_index("idx_complaints_created_date", "complaints", ["created_date"])

    # Violations table
    op.create_table(
        "violations",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("external_id", sa.String(50), nullable=True),
        sa.Column("building_id", sa.BigInteger(), nullable=True),
        sa.Column("bbl", sa.String(10), nullable=True),
        sa.Column("bin", sa.String(7), nullable=True),
        sa.Column("source", sa.String(10), nullable=False),
        sa.Column("violation_type", sa.String(100), nullable=True),
        sa.Column("severity", sa.String(5), nullable=True),
        sa.Column("order_number", sa.String(50), nullable=True),
        sa.Column("status", sa.String(50), nullable=True),
        sa.Column("status_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("inspection_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "original_certify_by_date",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "original_correct_by_date",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("external_id"),
        sa.ForeignKeyConstraint(["building_id"], ["buildings.id"]),
    )
    op.create_index("idx_violations_building_id", "violations", ["building_id"])
    op.create_index("idx_violations_bbl", "violations", ["bbl"])
    op.create_index("idx_violations_bin", "violations", ["bin"])
    op.create_index("idx_violations_bbl_date", "violations", ["bbl", "inspection_date"])
    op.create_index("idx_violations_source_severity", "violations", ["source", "severity"])
    op.create_index("idx_violations_category", "violations", ["category"])

    # Litigations table
    op.create_table(
        "litigations",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("external_id", sa.String(50), nullable=True),
        sa.Column("building_id", sa.BigInteger(), nullable=True),
        sa.Column("bbl", sa.String(10), nullable=True),
        sa.Column("case_type", sa.String(100), nullable=True),
        sa.Column("case_status", sa.String(50), nullable=True),
        sa.Column("case_open_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("case_close_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("case_judgment", sa.String(100), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("respondent", sa.String(200), nullable=True),
        sa.Column("penalty", sa.String(100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("external_id"),
        sa.ForeignKeyConstraint(["building_id"], ["buildings.id"]),
    )
    op.create_index("idx_litigations_building_id", "litigations", ["building_id"])
    op.create_index("idx_litigations_bbl", "litigations", ["bbl"])
    op.create_index("idx_litigations_case_open", "litigations", ["case_open_date"])

    # Rodent inspections table
    op.create_table(
        "rodent_inspections",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("external_id", sa.String(50), nullable=True),
        sa.Column("address", sa.String(200), nullable=True),
        sa.Column("borough", sa.String(20), nullable=True),
        sa.Column("zipcode", sa.String(5), nullable=True),
        sa.Column("bbl", sa.String(10), nullable=True),
        sa.Column("inspection_type", sa.String(100), nullable=True),
        sa.Column("result", sa.String(100), nullable=True),
        sa.Column("approved_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("inspection_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("external_id"),
    )
    op.create_index("idx_rodent_bbl", "rodent_inspections", ["bbl"])
    op.create_index("idx_rodent_address", "rodent_inspections", ["address"])
    op.create_index("idx_rodent_inspection_date", "rodent_inspections", ["inspection_date"])

    # Health scores table
    op.create_table(
        "health_scores",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("building_id", sa.BigInteger(), nullable=False),
        sa.Column("bbl", sa.String(10), nullable=False),
        sa.Column("composite_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("heat_hot_water_score", sa.Float(), server_default="100"),
        sa.Column("pest_rodent_score", sa.Float(), server_default="100"),
        sa.Column("structural_safety_score", sa.Float(), server_default="100"),
        sa.Column("hpd_severity_score", sa.Float(), server_default="100"),
        sa.Column("noise_score", sa.Float(), server_default="100"),
        sa.Column("litigation_score", sa.Float(), server_default="100"),
        sa.Column("age_maintenance_score", sa.Float(), server_default="100"),
        sa.Column("percentile_rank", sa.Float(), nullable=True),
        sa.Column("building_class", sa.String(10), nullable=True),
        sa.Column("total_complaints", sa.BigInteger(), server_default="0"),
        sa.Column("total_violations", sa.BigInteger(), server_default="0"),
        sa.Column("complaints_per_unit", sa.Float(), server_default="0"),
        sa.Column("violations_per_unit", sa.Float(), server_default="0"),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("building_id"),
        sa.UniqueConstraint("bbl"),
        sa.ForeignKeyConstraint(["building_id"], ["buildings.id"]),
    )
    op.create_index("idx_health_scores_bbl", "health_scores", ["bbl"])
    op.create_index("idx_health_scores_composite", "health_scores", ["composite_score"])
    op.create_index(
        "idx_health_scores_class_score",
        "health_scores",
        ["building_class", "composite_score"],
    )

    # Neighborhoods table
    op.create_table(
        "neighborhoods",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("borough", sa.String(20), nullable=False),
        sa.Column("avg_health_score", sa.Float(), nullable=True),
        sa.Column("median_health_score", sa.Float(), nullable=True),
        sa.Column("building_count", sa.Integer(), server_default="0"),
        sa.Column("total_complaints", sa.BigInteger(), server_default="0"),
        sa.Column("total_violations", sa.BigInteger(), server_default="0"),
        sa.Column(
            "centroid",
            geoalchemy2.Geometry(geometry_type="POINT", srid=4326),
            nullable=True,
        ),
        sa.Column("centroid_lat", sa.Float(), nullable=True),
        sa.Column("centroid_lng", sa.Float(), nullable=True),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )


def downgrade() -> None:
    op.drop_table("neighborhoods")
    op.drop_table("health_scores")
    op.drop_table("rodent_inspections")
    op.drop_table("litigations")
    op.drop_table("violations")
    op.drop_table("complaints")
    op.drop_table("buildings")
    op.execute("DROP EXTENSION IF EXISTS postgis")
