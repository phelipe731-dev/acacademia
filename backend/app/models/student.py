from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import StudentStatus


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    phone: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cpf: Mapped[str | None] = mapped_column(String(20), nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    plan: Mapped[str] = mapped_column(String(120), nullable=False)
    plan_end_date: Mapped[date | None] = mapped_column(Date, index=True, nullable=True)
    monthly_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    due_day: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[StudentStatus] = mapped_column(
        Enum(StudentStatus, name="student_status", native_enum=False),
        default=StudentStatus.ATIVO,
        index=True,
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    payments = relationship("Payment", back_populates="student", cascade="all, delete-orphan")
    checkins = relationship("CheckIn", back_populates="student", cascade="all, delete-orphan")
    training_plans = relationship("TrainingPlan", back_populates="student", cascade="all, delete-orphan")
