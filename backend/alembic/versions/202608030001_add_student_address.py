"""adiciona endereco ao aluno

Revision ID: 202608030001
Revises: 202608020001
Create Date: 2026-08-03 10:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "202608030001"
down_revision: str | None = "202608020001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("students", sa.Column("address", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("students", "address")
