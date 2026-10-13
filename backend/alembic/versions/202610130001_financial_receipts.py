"""adiciona recebimentos parciais para mensalidades e vendas a prazo

Revision ID: 202610130001
Revises: 202609080001
Create Date: 2026-10-13 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "202610130001"
down_revision: str | None = "202609080001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "financial_receipts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("payment_id", sa.Integer(), nullable=True),
        sa.Column("sale_installment_id", sa.Integer(), nullable=True),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("paid_at", sa.Date(), nullable=False),
        sa.Column(
            "payment_method",
            sa.Enum("DINHEIRO", "PIX", "CARTAO", "OUTRO", name="receipt_payment_method", native_enum=False),
            nullable=False,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "(payment_id IS NOT NULL AND sale_installment_id IS NULL) OR "
            "(payment_id IS NULL AND sale_installment_id IS NOT NULL)",
            name="ck_receipt_single_origin",
        ),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sale_installment_id"], ["sale_installments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_financial_receipts_id", "financial_receipts", ["id"], unique=False)
    op.create_index("ix_financial_receipts_payment_id", "financial_receipts", ["payment_id"], unique=False)
    op.create_index("ix_financial_receipts_sale_installment_id", "financial_receipts", ["sale_installment_id"], unique=False)
    op.create_index("ix_financial_receipts_paid_at", "financial_receipts", ["paid_at"], unique=False)

    # Preserva o historico dos pagamentos que ja estavam quitados antes da migracao.
    op.execute(
        """
        INSERT INTO financial_receipts
            (payment_id, amount, paid_at, payment_method, notes, created_by_id, created_at)
        SELECT p.id, s.amount, COALESCE(p.paid_at, CURRENT_DATE), s.payment_method,
               'Recebimento historico migrado da mensalidade.', p.created_by_id, CURRENT_TIMESTAMP
        FROM payments p
        JOIN payment_splits s ON s.payment_id = p.id
        WHERE p.status = 'PAGO'
        """
    )
    op.execute(
        """
        INSERT INTO financial_receipts
            (payment_id, amount, paid_at, payment_method, notes, created_by_id, created_at)
        SELECT p.id, p.amount, COALESCE(p.paid_at, CURRENT_DATE), p.payment_method,
               'Recebimento historico migrado da mensalidade.', p.created_by_id, CURRENT_TIMESTAMP
        FROM payments p
        WHERE p.status = 'PAGO'
          AND NOT EXISTS (SELECT 1 FROM payment_splits s WHERE s.payment_id = p.id)
        """
    )
    op.execute(
        """
        INSERT INTO financial_receipts
            (sale_installment_id, amount, paid_at, payment_method, notes, created_at)
        SELECT id, amount, COALESCE(paid_at, CURRENT_DATE), COALESCE(payment_method, 'PIX'),
               'Recebimento historico migrado da parcela da venda.', CURRENT_TIMESTAMP
        FROM sale_installments
        WHERE status = 'PAGA'
        """
    )


def downgrade() -> None:
    op.drop_index("ix_financial_receipts_paid_at", table_name="financial_receipts")
    op.drop_index("ix_financial_receipts_sale_installment_id", table_name="financial_receipts")
    op.drop_index("ix_financial_receipts_payment_id", table_name="financial_receipts")
    op.drop_index("ix_financial_receipts_id", table_name="financial_receipts")
    op.drop_table("financial_receipts")
