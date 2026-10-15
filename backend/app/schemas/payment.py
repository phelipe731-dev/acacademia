from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import PaymentMethod, PaymentStatus
from app.schemas.student import StudentRead
from app.schemas.user import UserRead


class PaymentBase(BaseModel):
    student_id: int
    amount: Decimal
    due_date: date
    paid_at: date | None = None
    status: PaymentStatus = PaymentStatus.PENDENTE
    payment_method: PaymentMethod = PaymentMethod.PIX
    notes: str | None = None

    @field_validator("amount")
    @classmethod
    def money_scale(cls, value: Decimal) -> Decimal:
        return value.quantize(Decimal("0.01"))


class PaymentSplitBase(BaseModel):
    payment_method: PaymentMethod
    amount: Decimal

    @field_validator("amount")
    @classmethod
    def money_scale(cls, value: Decimal) -> Decimal:
        return value.quantize(Decimal("0.01"))


class PaymentSplitCreate(PaymentSplitBase):
    amount: Decimal = Field(gt=0)


class PaymentSplitRead(PaymentSplitBase):
    id: int
    payment_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FinancialReceiptBase(BaseModel):
    amount: Decimal
    paid_at: date | None = None
    payment_method: PaymentMethod = PaymentMethod.PIX
    notes: str | None = None

    @field_validator("amount")
    @classmethod
    def receipt_money_scale(cls, value: Decimal) -> Decimal:
        return value.quantize(Decimal("0.01"))


class FinancialReceiptCreate(FinancialReceiptBase):
    amount: Decimal = Field(gt=0)


class FinancialReceiptRead(FinancialReceiptBase):
    id: int
    payment_id: int | None = None
    sale_installment_id: int | None = None
    created_by_id: int | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaymentCreate(PaymentBase):
    amount: Decimal = Field(gt=0)
    splits: list[PaymentSplitCreate] | None = None


class PaymentUpdate(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0)
    due_date: date | None = None
    paid_at: date | None = None
    status: PaymentStatus | None = None
    payment_method: PaymentMethod | None = None
    notes: str | None = None
    splits: list[PaymentSplitCreate] | None = None


class PaymentCancel(BaseModel):
    reason: str | None = Field(default=None, max_length=255)


class PaymentRead(PaymentBase):
    id: int
    created_by_id: int | None
    created_at: datetime
    updated_at: datetime
    splits: list[PaymentSplitRead] = Field(default_factory=list)
    receipts: list[FinancialReceiptRead] = Field(default_factory=list)
    total_paid: Decimal = Decimal("0.00")
    balance_due: Decimal = Decimal("0.00")

    model_config = ConfigDict(from_attributes=True)


class PaymentWithStudent(PaymentRead):
    student: StudentRead
    created_by: UserRead | None = None

    model_config = ConfigDict(from_attributes=True)
