"""amplia role de usuarios para professor

Revision ID: 202609010001
Revises: 202608060004
Create Date: 2026-09-01 10:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "202609010001"
down_revision: str | None = "202608060004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "role",
            existing_type=sa.String(length=8),
            type_=sa.String(length=9),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "role",
            existing_type=sa.String(length=9),
            type_=sa.String(length=8),
            existing_nullable=False,
        )
