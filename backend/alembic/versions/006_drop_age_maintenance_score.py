"""Drop deprecated age_maintenance_score column from health_scores

The age/maintenance sub-score was never implemented — compute.py wrote a
constant 0.0 placeholder and nothing read the column. Remove it.

Revision ID: 006
Revises: 005
Create Date: 2026-06-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("health_scores", "age_maintenance_score")


def downgrade() -> None:
    op.add_column(
        "health_scores",
        sa.Column("age_maintenance_score", sa.Float(), server_default="100"),
    )
