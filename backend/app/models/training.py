from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import TrainingMediaType


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TrainingPlan(Base):
    __tablename__ = "training_plans"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    objective: Mapped[str | None] = mapped_column(String(255), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reassessment_date: Mapped[date | None] = mapped_column(Date, index=True, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True, nullable=False)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    student = relationship("Student", back_populates="training_plans")
    created_by = relationship("User", back_populates="training_plans")
    exercises = relationship(
        "TrainingPlanExercise",
        back_populates="training_plan",
        cascade="all, delete-orphan",
        order_by="TrainingPlanExercise.sort_order",
    )
    share_links = relationship(
        "TrainingPlanShareLink",
        back_populates="training_plan",
        cascade="all, delete-orphan",
        order_by="TrainingPlanShareLink.created_at.desc()",
    )


class TrainingPlanExercise(Base):
    __tablename__ = "training_plan_exercises"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    training_plan_id: Mapped[int] = mapped_column(
        ForeignKey("training_plans.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    muscle_group: Mapped[str | None] = mapped_column(String(120), nullable=True)
    sets: Mapped[str | None] = mapped_column(String(40), nullable=True)
    repetitions: Mapped[str | None] = mapped_column(String(80), nullable=True)
    load: Mapped[str | None] = mapped_column(String(80), nullable=True)
    rest: Mapped[str | None] = mapped_column(String(80), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    training_plan = relationship("TrainingPlan", back_populates="exercises")
    media = relationship(
        "TrainingPlanExerciseMedia",
        back_populates="exercise",
        cascade="all, delete-orphan",
        order_by="TrainingPlanExerciseMedia.sort_order",
    )


class TrainingPlanExerciseMedia(Base):
    __tablename__ = "training_plan_exercise_media"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    training_plan_exercise_id: Mapped[int] = mapped_column(
        ForeignKey("training_plan_exercises.id", ondelete="CASCADE"), index=True
    )
    media_type: Mapped[TrainingMediaType] = mapped_column(
        Enum(TrainingMediaType, name="training_media_type", native_enum=False),
        nullable=False,
    )
    file_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    external_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    title: Mapped[str | None] = mapped_column(String(160), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    exercise = relationship("TrainingPlanExercise", back_populates="media")
    created_by = relationship("User", back_populates="training_media")


class TrainingPlanShareLink(Base):
    __tablename__ = "training_plan_share_links"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    training_plan_id: Mapped[int] = mapped_column(ForeignKey("training_plans.id", ondelete="CASCADE"), index=True)
    token: Mapped[str] = mapped_column(String(96), unique=True, index=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    training_plan = relationship("TrainingPlan", back_populates="share_links")
    created_by = relationship("User", back_populates="training_share_links")
