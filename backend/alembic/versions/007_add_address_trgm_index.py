"""Add a pg_trgm GIN index on buildings.address for fast address search

Single-building address lookup (the most common search) runs leading-wildcard
ILIKE matches across several normalized address variants. Without a trigram
index each variant forces a sequential scan of the ~859k-row buildings table.
A GIN index using gin_trgm_ops lets Postgres serve `address ILIKE '%...%'`
from the index instead, keeping the hot path fast and cheap.

Revision ID: 007
Revises: 006
Create Date: 2026-06-05
"""
from typing import Sequence, Union

from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.create_index(
        "idx_buildings_address_trgm",
        "buildings",
        ["address"],
        postgresql_using="gin",
        postgresql_ops={"address": "gin_trgm_ops"},
    )


def downgrade() -> None:
    op.drop_index("idx_buildings_address_trgm", table_name="buildings")
    # Leave the pg_trgm extension in place; other objects may depend on it.
