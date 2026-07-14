from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import PaymentMethod, PaymentStatus
from app.schemas.student import StudentRead
from app.schemas.user import UserRead


class PaymentBase(BaseModel):
    student_id: int
    amount: Decimal = Field(gt=0)
    due_date: date
    paid_at: date | None = None
    status: PaymentStatus = PaymentStatus.PENDENTE
    payment_method: PaymentMethod = PaymentMethod.PIX
    notes: str | None = None

    @field_validator("amount")
    @classmethod
    def money_scale(cls, value: Decimal) -> Decimal:
        return value.quantize(Decimal("0.01"))


class PaymentCreate(PaymentBase):
    pass


class PaymentUpdate(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0)
    due_date: date | None = None
    paid_at: date | None = None
    status: PaymentStatus | None = None
    payment_method: PaymentMethod | None = None
    notes: str | None = None


class PaymentRead(PaymentBase):
    id: int
    created_by_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaymentWithStudent(PaymentRead):
    student: StudentRead
    created_by: UserRead | None = None

    model_config = ConfigDict(from_attributes=True)
