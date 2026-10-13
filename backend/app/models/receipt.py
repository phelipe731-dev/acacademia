from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, Enum, ForeignKey, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import PaymentMethod


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class FinancialReceipt(Base):
    __tablename__ = "financial_receipts"
    __table_args__ = (
        CheckConstraint(
            "(payment_id IS NOT NULL AND sale_installment_id IS NULL) OR "
            "(payment_id IS NULL AND sale_installment_id IS NOT NULL)",
            name="ck_receipt_single_origin",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    payment_id: Mapped[int | None] = mapped_column(ForeignKey("payments.id", ondelete="CASCADE"), index=True)
    sale_installment_id: Mapped[int | None] = mapped_column(
        ForeignKey("sale_installments.id", ondelete="CASCADE"), index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    paid_at: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    payment_method: Mapped[PaymentMethod] = mapped_column(
        Enum(PaymentMethod, name="receipt_payment_method", native_enum=False), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    payment = relationship("Payment", back_populates="receipts")
    sale_installment = relationship("SaleInstallment", back_populates="receipts")
    created_by = relationship("User")
