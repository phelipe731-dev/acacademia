from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import PaymentMethod, SalePaymentMethod
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
    notes: str | None = None
    items: list[SaleItemCreate] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_installments(self) -> "SaleCreate":
        if self.payment_method == SalePaymentMethod.PRAZO:
            if self.installments_count < 2:
                raise ValueError("Venda a prazo deve ter pelo menos 2 parcelas.")
            if self.installment_payment_method is None:
                raise ValueError("Informe a forma combinada para as parcelas.")
        else:
            self.installments_count = 1
            self.installment_payment_method = None
        return self


class SaleItemRead(BaseModel):
    id: int
    product_id: int
    quantity: int
    unit_price: Decimal
    subtotal: Decimal
    product: ProductRead | None = None

    model_config = ConfigDict(from_attributes=True)


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
    student: StudentRead | None = None
    created_by: UserRead | None = None

    model_config = ConfigDict(from_attributes=True)
