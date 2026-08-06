"""adiciona indice para dashboard de vendas

Revision ID: 202608060001
Revises: 202608030001
Create Date: 2026-08-06 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op


revision: str = "202608060001"
down_revision: str | None = "202608030001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(op.f("ix_sales_created_at"), "sales", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_sales_created_at"), table_name="sales")
