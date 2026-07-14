from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import PaymentMethod
from app.schemas.product import ProductRead
from app.schemas.user import UserRead


class SaleItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)


class SaleCreate(BaseModel):
    payment_method: PaymentMethod = PaymentMethod.PIX
    notes: str | None = None
    items: list[SaleItemCreate] = Field(min_length=1)


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
    payment_method: PaymentMethod
    total_amount: Decimal
    notes: str | None
    created_by_id: int | None
    created_at: datetime
    items: list[SaleItemRead] = []
    created_by: UserRead | None = None

    model_config = ConfigDict(from_attributes=True)
