"""adiciona data de inicio do plano do aluno

Revision ID: 202608060002
Revises: 202608060001
Create Date: 2026-08-06 10:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "202608060002"
down_revision: str | None = "202608060001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("students", sa.Column("plan_start_date", sa.Date(), nullable=True))

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("UPDATE students SET plan_start_date = created_at::date WHERE plan_start_date IS NULL")
    else:
        op.execute("UPDATE students SET plan_start_date = DATE(created_at) WHERE plan_start_date IS NULL")


def downgrade() -> None:
    op.drop_column("students", "plan_start_date")
