"""Add a (bbl, category) index on complaints for complaint-type search filters

Searches like "rent-stabilized, no heat complaints" run a per-building
NOT EXISTS (SELECT 1 FROM complaints WHERE bbl = b.bbl AND category = ANY(...)).
With only the single-column bbl index each probe fetches every complaint row
for the building from the heap to check its category, which pushed that query
past the 30s statement timeout on a cold cache. The composite index turns each
probe into an index-only lookup.

Revision ID: 009
Revises: 008
Create Date: 2026-11-10
"""
from typing import Sequence, Union

from alembic import op

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("idx_complaints_bbl_category", "complaints", ["bbl", "category"])


def downgrade() -> None:
    op.drop_index("idx_complaints_bbl_category", table_name="complaints")
