"""checkins, plan_end_date e unicidade de aluno

Revision ID: 202607130003
Revises: 202607130002
Create Date: 2026-07-14 13:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "202607130003"
down_revision: str | None = "202607130002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("students", sa.Column("plan_end_date", sa.Date(), nullable=True))
    op.create_index(op.f("ix_students_plan_end_date"), "students", ["plan_end_date"], unique=False)

    # Unicidade defensiva: impede CPF/e-mail duplicados (ignorando nulos) mesmo em
    # importacoes ou acessos concorrentes. E-mail comparado em minusculas.
    op.create_index(
        "uq_students_cpf",
        "students",
        ["cpf"],
        unique=True,
        postgresql_where=sa.text("cpf IS NOT NULL"),
        sqlite_where=sa.text("cpf IS NOT NULL"),
    )
    op.create_index(
        "uq_students_email_lower",
        "students",
        [sa.text("lower(email)")],
        unique=True,
        postgresql_where=sa.text("email IS NOT NULL"),
        sqlite_where=sa.text("email IS NOT NULL"),
    )

    op.create_table(
        "checkins",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("checked_in_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_checkins_id"), "checkins", ["id"], unique=False)
    op.create_index(op.f("ix_checkins_student_id"), "checkins", ["student_id"], unique=False)
    op.create_index(op.f("ix_checkins_checked_in_at"), "checkins", ["checked_in_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_checkins_checked_in_at"), table_name="checkins")
    op.drop_index(op.f("ix_checkins_student_id"), table_name="checkins")
    op.drop_index(op.f("ix_checkins_id"), table_name="checkins")
    op.drop_table("checkins")
    op.drop_index("uq_students_email_lower", table_name="students")
    op.drop_index("uq_students_cpf", table_name="students")
    op.drop_index(op.f("ix_students_plan_end_date"), table_name="students")
    op.drop_column("students", "plan_end_date")
