"""Add listing signal tables: listings_raw, building_listing_signal, listing_raw_log

Revision ID: 003
Revises: 002
Create Date: 2026-04-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Raw listings captured from external search APIs
    op.create_table(
        "listings_raw",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("listing_id", sa.String(100), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),   # "zillow" | "streeteasy"
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lon", sa.Float(), nullable=False),
        sa.Column("price", sa.Integer(), nullable=True),
        sa.Column("beds", sa.Float(), nullable=True),
        sa.Column("address", sa.String(300), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("building_id", sa.BigInteger(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("listing_id", "source", name="uq_listing_source"),
        sa.ForeignKeyConstraint(["building_id"], ["buildings.id"], ondelete="SET NULL"),
    )
    op.create_index("idx_listings_raw_building_id", "listings_raw", ["building_id"])
    op.create_index("idx_listings_raw_fetched_at", "listings_raw", ["fetched_at"])
    op.create_index("idx_listings_raw_source", "listings_raw", ["source"])

    # Aggregated per-building signals (one row per building, upserted on every run)
    op.create_table(
        "building_listing_signal",
        sa.Column("building_id", sa.BigInteger(), nullable=False),
        sa.Column("active_listings_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("min_price", sa.Integer(), nullable=True),
        sa.Column("max_price", sa.Integer(), nullable=True),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("building_id"),
        sa.ForeignKeyConstraint(["building_id"], ["buildings.id"], ondelete="CASCADE"),
    )

    # Sampled raw API responses kept for debugging schema drift
    op.create_table(
        "listing_raw_log",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("payload", sa.Text(), nullable=True),
        sa.Column("logged_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_raw_log_logged_at", "listing_raw_log", ["logged_at"])


def downgrade() -> None:
    op.drop_index("idx_raw_log_logged_at", table_name="listing_raw_log")
    op.drop_table("listing_raw_log")
    op.drop_table("building_listing_signal")
    op.drop_index("idx_listings_raw_source", table_name="listings_raw")
    op.drop_index("idx_listings_raw_fetched_at", table_name="listings_raw")
    op.drop_index("idx_listings_raw_building_id", table_name="listings_raw")
    op.drop_table("listings_raw")
