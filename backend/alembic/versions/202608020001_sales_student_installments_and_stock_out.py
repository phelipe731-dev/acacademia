"""vendas vinculadas a aluno e parcelamento simples

Revision ID: 202608020001
Revises: 202607140001
Create Date: 2026-08-02 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "202608020001"
down_revision: str | None = "202607140001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


sale_installment_payment_method = sa.Enum(
    "DINHEIRO",
    "PIX",
    "CARTAO",
    "OUTRO",
    name="sale_installment_payment_method",
    native_enum=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        op.execute(sa.text("DROP TABLE IF EXISTS _alembic_tmp_sales"))

    with op.batch_alter_table("sales") as batch_op:
        batch_op.add_column(sa.Column("student_id", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column("installments_count", sa.Integer(), server_default="1", nullable=True)
        )
        batch_op.add_column(sa.Column("installment_payment_method", sale_installment_payment_method, nullable=True))
        batch_op.create_foreign_key(
            "fk_sales_student_id_students",
            "students",
            ["student_id"],
            ["id"],
            ondelete="SET NULL",
        )

    op.execute(sa.text("UPDATE sales SET installments_count = 1 WHERE installments_count IS NULL"))

    with op.batch_alter_table("sales") as batch_op:
        batch_op.alter_column("installments_count", existing_type=sa.Integer(), nullable=False, server_default=None)
    op.create_index(op.f("ix_sales_student_id"), "sales", ["student_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_sales_student_id"), table_name="sales")
    with op.batch_alter_table("sales") as batch_op:
        batch_op.drop_constraint("fk_sales_student_id_students", type_="foreignkey")
        batch_op.drop_column("installment_payment_method")
        batch_op.drop_column("installments_count")
        batch_op.drop_column("student_id")
