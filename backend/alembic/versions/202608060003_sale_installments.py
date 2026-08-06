"""cria faturas de vendas a prazo

Revision ID: 202608060003
Revises: 202608060002
Create Date: 2026-08-06 18:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "202608060003"
down_revision: str | None = "202608060002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


sale_installment_status = sa.Enum(
    "ABERTA",
    "PAGA",
    "ATRASADA",
    "CANCELADA",
    name="sale_installment_status",
    native_enum=False,
)

sale_installment_actual_payment_method = sa.Enum(
    "DINHEIRO",
    "PIX",
    "CARTAO",
    "OUTRO",
    name="sale_installment_actual_payment_method",
    native_enum=False,
)


def upgrade() -> None:
    op.create_table(
        "sale_installments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("sale_id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("installment_number", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("paid_at", sa.Date(), nullable=True),
        sa.Column("status", sale_installment_status, server_default="ABERTA", nullable=False),
        sa.Column("payment_method", sale_installment_actual_payment_method, nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["sale_id"], ["sales.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sale_id", "installment_number", name="uq_sale_installments_sale_number"),
    )
    op.create_index(op.f("ix_sale_installments_id"), "sale_installments", ["id"], unique=False)
    op.create_index(op.f("ix_sale_installments_sale_id"), "sale_installments", ["sale_id"], unique=False)
    op.create_index(op.f("ix_sale_installments_student_id"), "sale_installments", ["student_id"], unique=False)
    op.create_index(op.f("ix_sale_installments_due_date"), "sale_installments", ["due_date"], unique=False)
    op.create_index(op.f("ix_sale_installments_paid_at"), "sale_installments", ["paid_at"], unique=False)
    op.create_index(op.f("ix_sale_installments_status"), "sale_installments", ["status"], unique=False)

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            sa.text(
                """
                WITH numbered AS (
                    SELECT
                        s.id AS sale_id,
                        s.student_id,
                        s.total_amount,
                        GREATEST(s.installments_count, 1) AS installments_count,
                        s.created_at,
                        s.notes,
                        gs.n AS installment_number
                    FROM sales s
                    JOIN LATERAL generate_series(1, GREATEST(s.installments_count, 1)) AS gs(n) ON TRUE
                    WHERE s.payment_method = 'PRAZO' AND s.student_id IS NOT NULL
                )
                INSERT INTO sale_installments (
                    sale_id,
                    student_id,
                    installment_number,
                    amount,
                    due_date,
                    paid_at,
                    status,
                    payment_method,
                    notes,
                    created_at,
                    updated_at
                )
                SELECT
                    sale_id,
                    student_id,
                    installment_number,
                    CASE
                        WHEN installment_number < installments_count
                            THEN (floor((total_amount * 100) / installments_count) / 100)::numeric(10, 2)
                        ELSE (
                            total_amount -
                            ((floor((total_amount * 100) / installments_count) / 100) * (installments_count - 1))
                        )::numeric(10, 2)
                    END,
                    (created_at::date + ((installment_number - 1) * interval '1 month'))::date,
                    NULL,
                    CASE
                        WHEN (created_at::date + ((installment_number - 1) * interval '1 month'))::date < CURRENT_DATE
                            THEN 'ATRASADA'
                        ELSE 'ABERTA'
                    END,
                    NULL,
                    notes,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                FROM numbered
                """
            )
        )
    else:
        op.execute(
            sa.text(
                """
                WITH RECURSIVE numbers(n) AS (
                    SELECT 1
                    UNION ALL
                    SELECT n + 1 FROM numbers WHERE n < 24
                ),
                numbered AS (
                    SELECT
                        s.id AS sale_id,
                        s.student_id,
                        s.total_amount,
                        CASE WHEN s.installments_count > 0 THEN s.installments_count ELSE 1 END AS installments_count,
                        s.created_at,
                        s.notes,
                        numbers.n AS installment_number
                    FROM sales s
                    JOIN numbers ON numbers.n <= CASE WHEN s.installments_count > 0 THEN s.installments_count ELSE 1 END
                    WHERE s.payment_method = 'PRAZO' AND s.student_id IS NOT NULL
                )
                INSERT INTO sale_installments (
                    sale_id,
                    student_id,
                    installment_number,
                    amount,
                    due_date,
                    paid_at,
                    status,
                    payment_method,
                    notes,
                    created_at,
                    updated_at
                )
                SELECT
                    sale_id,
                    student_id,
                    installment_number,
                    CASE
                        WHEN installment_number < installments_count
                            THEN ROUND(CAST((total_amount * 100.0 / installments_count) AS INTEGER) / 100.0, 2)
                        ELSE ROUND(
                            total_amount -
                            ((CAST((total_amount * 100.0 / installments_count) AS INTEGER) / 100.0) * (installments_count - 1)),
                            2
                        )
                    END,
                    date(created_at, printf('+%d months', installment_number - 1)),
                    NULL,
                    CASE
                        WHEN date(created_at, printf('+%d months', installment_number - 1)) < date('now')
                            THEN 'ATRASADA'
                        ELSE 'ABERTA'
                    END,
                    NULL,
                    notes,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                FROM numbered
                """
            )
        )


def downgrade() -> None:
    op.drop_index(op.f("ix_sale_installments_status"), table_name="sale_installments")
    op.drop_index(op.f("ix_sale_installments_paid_at"), table_name="sale_installments")
    op.drop_index(op.f("ix_sale_installments_due_date"), table_name="sale_installments")
    op.drop_index(op.f("ix_sale_installments_student_id"), table_name="sale_installments")
    op.drop_index(op.f("ix_sale_installments_sale_id"), table_name="sale_installments")
    op.drop_index(op.f("ix_sale_installments_id"), table_name="sale_installments")
    op.drop_table("sale_installments")
