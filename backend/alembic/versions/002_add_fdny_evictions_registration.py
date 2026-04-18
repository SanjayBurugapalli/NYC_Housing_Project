"""Add FDNY violations, evictions tables and managing_agent column

Revision ID: 002
Revises: 001
Create Date: 2026-04-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add managing_agent to buildings
    op.add_column("buildings", sa.Column("managing_agent", sa.String(200), nullable=True))

    # FDNY violations table
    op.create_table(
        "fdny_violations",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("external_id", sa.String(50), nullable=True, unique=True),
        sa.Column("bbl", sa.String(10), nullable=True),
        sa.Column("bin", sa.String(7), nullable=True),
        sa.Column("violation_number", sa.String(50), nullable=True),
        sa.Column("violation_type", sa.String(200), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(50), nullable=True),
        sa.Column("violation_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("close_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("address", sa.String(200), nullable=True),
        sa.Column("borough", sa.String(20), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_fdny_violations_bbl", "fdny_violations", ["bbl"])
    op.create_index("idx_fdny_violations_bin", "fdny_violations", ["bin"])
    op.create_index("idx_fdny_violations_date", "fdny_violations", ["violation_date"])

    # Evictions table
    op.create_table(
        "evictions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("external_id", sa.String(100), nullable=True, unique=True),
        sa.Column("bbl", sa.String(10), nullable=True),
        sa.Column("address", sa.String(200), nullable=True),
        sa.Column("borough", sa.String(20), nullable=True),
        sa.Column("apartment_no", sa.String(20), nullable=True),
        sa.Column("respondent", sa.String(200), nullable=True),
        sa.Column("executed_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("marshal_name", sa.String(200), nullable=True),
        sa.Column("eviction_type", sa.String(50), nullable=True),
        sa.Column("residential_commercial", sa.String(20), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_evictions_bbl", "evictions", ["bbl"])
    op.create_index("idx_evictions_date", "evictions", ["executed_date"])


def downgrade() -> None:
    op.drop_table("evictions")
    op.drop_table("fdny_violations")
    op.drop_column("buildings", "managing_agent")
