from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import PaymentMethod, SaleInstallmentStatus, SalePaymentMethod, SaleStatus


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Sale(Base):
    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    student_id: Mapped[int | None] = mapped_column(ForeignKey("students.id", ondelete="SET NULL"), index=True)
    payment_method: Mapped[SalePaymentMethod] = mapped_column(
        Enum(SalePaymentMethod, name="sale_payment_method", native_enum=False),
        nullable=False,
    )
    installments_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    installment_payment_method: Mapped[PaymentMethod | None] = mapped_column(
        Enum(PaymentMethod, name="sale_installment_payment_method", native_enum=False),
        nullable=True,
    )
    status: Mapped[SaleStatus] = mapped_column(
        Enum(SaleStatus, name="sale_status", native_enum=False),
        default=SaleStatus.CONCLUIDA,
        index=True,
        nullable=False,
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True, nullable=False)
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    canceled_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    student = relationship("Student", back_populates="sales")
    created_by = relationship("User", foreign_keys=[created_by_id], back_populates="sales")
    canceled_by = relationship("User", foreign_keys=[canceled_by_id])
    items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")
    installments = relationship("SaleInstallment", back_populates="sale", cascade="all, delete-orphan")


class SaleItem(Base):
    __tablename__ = "sale_items"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    sale = relationship("Sale", back_populates="items")
    product = relationship("Product", back_populates="sale_items")


class SaleInstallment(Base):
    __tablename__ = "sale_installments"
    __table_args__ = (UniqueConstraint("sale_id", "installment_number", name="uq_sale_installments_sale_number"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id", ondelete="CASCADE"), index=True, nullable=False)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True, nullable=False)
    installment_number: Mapped[int] = mapped_column(Integer, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    paid_at: Mapped[date | None] = mapped_column(Date, index=True, nullable=True)
    status: Mapped[SaleInstallmentStatus] = mapped_column(
        Enum(SaleInstallmentStatus, name="sale_installment_status", native_enum=False),
        default=SaleInstallmentStatus.ABERTA,
        index=True,
        nullable=False,
    )
    payment_method: Mapped[PaymentMethod | None] = mapped_column(
        Enum(PaymentMethod, name="sale_installment_actual_payment_method", native_enum=False),
        nullable=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    sale = relationship("Sale", back_populates="installments")
    student = relationship("Student", back_populates="sale_installments")
