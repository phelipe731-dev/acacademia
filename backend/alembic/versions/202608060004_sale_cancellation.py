"""adiciona cancelamento de vendas

Revision ID: 202608060004
Revises: 202608060003
Create Date: 2026-08-06 19:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "202608060004"
down_revision: str | None = "202608060003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


sale_status = sa.Enum("CONCLUIDA", "CANCELADA", name="sale_status", native_enum=False)


def upgrade() -> None:
    with op.batch_alter_table("sales") as batch_op:
        batch_op.add_column(sa.Column("status", sale_status, server_default="CONCLUIDA", nullable=False))
        batch_op.add_column(sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("canceled_by_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("cancel_reason", sa.String(length=255), nullable=True))
        batch_op.create_foreign_key(
            "fk_sales_canceled_by_id_users",
            "users",
            ["canceled_by_id"],
            ["id"],
        )

    op.create_index(op.f("ix_sales_status"), "sales", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_sales_status"), table_name="sales")
    with op.batch_alter_table("sales") as batch_op:
        batch_op.drop_constraint("fk_sales_canceled_by_id_users", type_="foreignkey")
        batch_op.drop_column("cancel_reason")
        batch_op.drop_column("canceled_by_id")
        batch_op.drop_column("canceled_at")
        batch_op.drop_column("status")
