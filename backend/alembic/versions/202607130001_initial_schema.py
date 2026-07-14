"""initial schema

Revision ID: 202607130001
Revises:
Create Date: 2026-07-13 17:20:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "202607130001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


user_role = sa.Enum("ADMIN", "RECEPCAO", name="user_role", native_enum=False)
student_status = sa.Enum("ATIVO", "INATIVO", "INADIMPLENTE", name="student_status", native_enum=False)
payment_status = sa.Enum("PENDENTE", "PAGO", "ATRASADO", "CANCELADO", name="payment_status", native_enum=False)
payment_method = sa.Enum("DINHEIRO", "PIX", "CARTAO", "OUTRO", name="payment_method", native_enum=False)
product_status = sa.Enum("ATIVO", "INATIVO", name="product_status", native_enum=False)
stock_movement_type = sa.Enum("ENTRADA", "SAIDA_VENDA", "AJUSTE", name="stock_movement_type", native_enum=False)
sale_payment_method = sa.Enum("DINHEIRO", "PIX", "CARTAO", "OUTRO", name="sale_payment_method", native_enum=False)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)

    op.create_table(
        "students",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("phone", sa.String(length=40), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("cpf", sa.String(length=20), nullable=True),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("plan", sa.String(length=120), nullable=False),
        sa.Column("monthly_fee", sa.Numeric(10, 2), nullable=False),
        sa.Column("due_day", sa.Integer(), nullable=False),
        sa.Column("status", student_status, nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_students_id"), "students", ["id"], unique=False)
    op.create_index(op.f("ix_students_name"), "students", ["name"], unique=False)
    op.create_index(op.f("ix_students_phone"), "students", ["phone"], unique=False)
    op.create_index(op.f("ix_students_status"), "students", ["status"], unique=False)

    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("category", sa.String(length=120), nullable=True),
        sa.Column("cost_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("sale_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("stock_quantity", sa.Integer(), nullable=False),
        sa.Column("min_stock", sa.Integer(), nullable=False),
        sa.Column("status", product_status, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_products_id"), "products", ["id"], unique=False)
    op.create_index(op.f("ix_products_name"), "products", ["name"], unique=False)
    op.create_index(op.f("ix_products_status"), "products", ["status"], unique=False)

    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("paid_at", sa.Date(), nullable=True),
        sa.Column("status", payment_status, nullable=False),
        sa.Column("payment_method", payment_method, nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_payments_due_date"), "payments", ["due_date"], unique=False)
    op.create_index(op.f("ix_payments_id"), "payments", ["id"], unique=False)
    op.create_index(op.f("ix_payments_paid_at"), "payments", ["paid_at"], unique=False)
    op.create_index(op.f("ix_payments_status"), "payments", ["status"], unique=False)
    op.create_index(op.f("ix_payments_student_id"), "payments", ["student_id"], unique=False)

    op.create_table(
        "sales",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("payment_method", sale_payment_method, nullable=False),
        sa.Column("total_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_sales_id"), "sales", ["id"], unique=False)

    op.create_table(
        "stock_movements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("type", stock_movement_type, nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_stock_movements_id"), "stock_movements", ["id"], unique=False)
    op.create_index(op.f("ix_stock_movements_product_id"), "stock_movements", ["product_id"], unique=False)
    op.create_index(op.f("ix_stock_movements_type"), "stock_movements", ["type"], unique=False)

    op.create_table(
        "sale_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("sale_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("subtotal", sa.Numeric(10, 2), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.ForeignKeyConstraint(["sale_id"], ["sales.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_sale_items_id"), "sale_items", ["id"], unique=False)
    op.create_index(op.f("ix_sale_items_product_id"), "sale_items", ["product_id"], unique=False)
    op.create_index(op.f("ix_sale_items_sale_id"), "sale_items", ["sale_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_sale_items_sale_id"), table_name="sale_items")
    op.drop_index(op.f("ix_sale_items_product_id"), table_name="sale_items")
    op.drop_index(op.f("ix_sale_items_id"), table_name="sale_items")
    op.drop_table("sale_items")
    op.drop_index(op.f("ix_stock_movements_type"), table_name="stock_movements")
    op.drop_index(op.f("ix_stock_movements_product_id"), table_name="stock_movements")
    op.drop_index(op.f("ix_stock_movements_id"), table_name="stock_movements")
    op.drop_table("stock_movements")
    op.drop_index(op.f("ix_sales_id"), table_name="sales")
    op.drop_table("sales")
    op.drop_index(op.f("ix_payments_student_id"), table_name="payments")
    op.drop_index(op.f("ix_payments_status"), table_name="payments")
    op.drop_index(op.f("ix_payments_paid_at"), table_name="payments")
    op.drop_index(op.f("ix_payments_id"), table_name="payments")
    op.drop_index(op.f("ix_payments_due_date"), table_name="payments")
    op.drop_table("payments")
    op.drop_index(op.f("ix_products_status"), table_name="products")
    op.drop_index(op.f("ix_products_name"), table_name="products")
    op.drop_index(op.f("ix_products_id"), table_name="products")
    op.drop_table("products")
    op.drop_index(op.f("ix_students_status"), table_name="students")
    op.drop_index(op.f("ix_students_phone"), table_name="students")
    op.drop_index(op.f("ix_students_name"), table_name="students")
    op.drop_index(op.f("ix_students_id"), table_name="students")
    op.drop_table("students")
    op.drop_index(op.f("ix_users_id"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
