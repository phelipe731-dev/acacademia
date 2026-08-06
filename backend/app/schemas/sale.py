from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import PaymentMethod, SaleInstallmentStatus, SalePaymentMethod
from app.schemas.product import ProductRead
from app.schemas.student import StudentRead
from app.schemas.user import UserRead


class SaleItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)


class SaleCreate(BaseModel):
    student_id: int
    payment_method: SalePaymentMethod = SalePaymentMethod.PIX
    installments_count: int = Field(default=1, ge=1, le=24)
    installment_payment_method: PaymentMethod | None = None
    first_due_date: date | None = None
    notes: str | None = None
    items: list[SaleItemCreate] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_installments(self) -> "SaleCreate":
        if self.payment_method == SalePaymentMethod.PRAZO:
            if self.installment_payment_method is None:
                raise ValueError("Informe a forma combinada para as parcelas.")
            if self.first_due_date is None:
                raise ValueError("Informe o vencimento da primeira parcela.")
        else:
            self.installments_count = 1
            self.installment_payment_method = None
            self.first_due_date = None
        return self


class SaleItemRead(BaseModel):
    id: int
    product_id: int
    quantity: int
    unit_price: Decimal
    subtotal: Decimal
    product: ProductRead | None = None

    model_config = ConfigDict(from_attributes=True)


class SaleInstallmentRead(BaseModel):
    id: int
    sale_id: int
    student_id: int
    installment_number: int
    amount: Decimal
    due_date: date
    paid_at: date | None = None
    status: SaleInstallmentStatus
    payment_method: PaymentMethod | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SaleInstallmentPay(BaseModel):
    paid_at: date | None = None
    payment_method: PaymentMethod | None = None
    notes: str | None = None


class SaleRead(BaseModel):
    id: int
    student_id: int | None
    payment_method: SalePaymentMethod
    installments_count: int
    installment_payment_method: PaymentMethod | None = None
    total_amount: Decimal
    notes: str | None
    created_by_id: int | None
    created_at: datetime
    items: list[SaleItemRead] = []
    installments: list[SaleInstallmentRead] = []
    student: StudentRead | None = None
    created_by: UserRead | None = None

    model_config = ConfigDict(from_attributes=True)
