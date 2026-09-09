"""adiciona composicao de pagamentos de mensalidade

Revision ID: 202609080001
Revises: 202609020001
Create Date: 2026-09-08 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "202609080001"
down_revision: str | None = "202609020001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "payment_splits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("payment_id", sa.Integer(), nullable=False),
        sa.Column("payment_method", sa.Enum("DINHEIRO", "PIX", "CARTAO", "OUTRO", name="payment_method", native_enum=False), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_payment_splits_id"), "payment_splits", ["id"], unique=False)
    op.create_index(op.f("ix_payment_splits_payment_id"), "payment_splits", ["payment_id"], unique=False)
    op.execute(
        sa.text(
            """
            INSERT INTO payment_splits (payment_id, payment_method, amount, created_at)
            SELECT id, payment_method, amount, CURRENT_TIMESTAMP
            FROM payments
            WHERE status = 'PAGO'
            """
        )
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_payment_splits_payment_id"), table_name="payment_splits")
    op.drop_index(op.f("ix_payment_splits_id"), table_name="payment_splits")
    op.drop_table("payment_splits")
