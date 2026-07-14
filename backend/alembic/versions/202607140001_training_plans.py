"""fichas de treino, midias e links publicos

Revision ID: 202607140001
Revises: 202607130003
Create Date: 2026-07-14 18:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "202607140001"
down_revision: str | None = "202607130003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "training_plans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("objective", sa.String(length=255), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("reassessment_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_training_plans_id"), "training_plans", ["id"], unique=False)
    op.create_index(op.f("ix_training_plans_student_id"), "training_plans", ["student_id"], unique=False)
    op.create_index(op.f("ix_training_plans_reassessment_date"), "training_plans", ["reassessment_date"], unique=False)
    op.create_index(op.f("ix_training_plans_is_active"), "training_plans", ["is_active"], unique=False)

    op.create_table(
        "training_plan_exercises",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("training_plan_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("muscle_group", sa.String(length=120), nullable=True),
        sa.Column("sets", sa.String(length=40), nullable=True),
        sa.Column("repetitions", sa.String(length=80), nullable=True),
        sa.Column("load", sa.String(length=80), nullable=True),
        sa.Column("rest", sa.String(length=80), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["training_plan_id"], ["training_plans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_training_plan_exercises_id"), "training_plan_exercises", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_training_plan_exercises_training_plan_id"),
        "training_plan_exercises",
        ["training_plan_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_training_plan_exercises_is_active"), "training_plan_exercises", ["is_active"], unique=False
    )

    op.create_table(
        "training_plan_exercise_media",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("training_plan_exercise_id", sa.Integer(), nullable=False),
        sa.Column("media_type", sa.Enum("IMAGE", "VIDEO", "EXTERNAL_IMAGE", "EXTERNAL_VIDEO", name="training_media_type", native_enum=False), nullable=False),
        sa.Column("file_url", sa.String(length=500), nullable=True),
        sa.Column("external_url", sa.String(length=500), nullable=True),
        sa.Column("thumbnail_url", sa.String(length=500), nullable=True),
        sa.Column("title", sa.String(length=160), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["training_plan_exercise_id"], ["training_plan_exercises.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_training_plan_exercise_media_id"),
        "training_plan_exercise_media",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_training_plan_exercise_media_training_plan_exercise_id"),
        "training_plan_exercise_media",
        ["training_plan_exercise_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_training_plan_exercise_media_is_active"),
        "training_plan_exercise_media",
        ["is_active"],
        unique=False,
    )

    op.create_table(
        "training_plan_share_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("training_plan_id", sa.Integer(), nullable=False),
        sa.Column("token", sa.String(length=96), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["training_plan_id"], ["training_plans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_training_plan_share_links_id"), "training_plan_share_links", ["id"], unique=False)
    op.create_index(
        op.f("ix_training_plan_share_links_training_plan_id"),
        "training_plan_share_links",
        ["training_plan_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_training_plan_share_links_token"),
        "training_plan_share_links",
        ["token"],
        unique=True,
    )
    op.create_index(
        op.f("ix_training_plan_share_links_is_active"),
        "training_plan_share_links",
        ["is_active"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_training_plan_share_links_is_active"), table_name="training_plan_share_links")
    op.drop_index(op.f("ix_training_plan_share_links_token"), table_name="training_plan_share_links")
    op.drop_index(op.f("ix_training_plan_share_links_training_plan_id"), table_name="training_plan_share_links")
    op.drop_index(op.f("ix_training_plan_share_links_id"), table_name="training_plan_share_links")
    op.drop_table("training_plan_share_links")

    op.drop_index(op.f("ix_training_plan_exercise_media_is_active"), table_name="training_plan_exercise_media")
    op.drop_index(
        op.f("ix_training_plan_exercise_media_training_plan_exercise_id"),
        table_name="training_plan_exercise_media",
    )
    op.drop_index(op.f("ix_training_plan_exercise_media_id"), table_name="training_plan_exercise_media")
    op.drop_table("training_plan_exercise_media")

    op.drop_index(op.f("ix_training_plan_exercises_is_active"), table_name="training_plan_exercises")
    op.drop_index(op.f("ix_training_plan_exercises_training_plan_id"), table_name="training_plan_exercises")
    op.drop_index(op.f("ix_training_plan_exercises_id"), table_name="training_plan_exercises")
    op.drop_table("training_plan_exercises")

    op.drop_index(op.f("ix_training_plans_is_active"), table_name="training_plans")
    op.drop_index(op.f("ix_training_plans_reassessment_date"), table_name="training_plans")
    op.drop_index(op.f("ix_training_plans_student_id"), table_name="training_plans")
    op.drop_index(op.f("ix_training_plans_id"), table_name="training_plans")
    op.drop_table("training_plans")
