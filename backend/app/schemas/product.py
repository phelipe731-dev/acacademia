from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import ProductStatus


class ProductBase(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    category: str | None = Field(default=None, max_length=120)
    cost_price: Decimal | None = Field(default=None, ge=0)
    sale_price: Decimal = Field(gt=0)
    stock_quantity: int = Field(default=0, ge=0)
    min_stock: int = Field(default=0, ge=0)
    status: ProductStatus = ProductStatus.ATIVO

    @field_validator("cost_price", "sale_price")
    @classmethod
    def money_scale(cls, value: Decimal | None) -> Decimal | None:
        return value.quantize(Decimal("0.01")) if value is not None else None


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    category: str | None = Field(default=None, max_length=120)
    cost_price: Decimal | None = Field(default=None, ge=0)
    sale_price: Decimal | None = Field(default=None, gt=0)
    stock_quantity: int | None = Field(default=None, ge=0)
    min_stock: int | None = Field(default=None, ge=0)
    status: ProductStatus | None = None


class ProductRead(ProductBase):
    id: int
    created_at: datetime
    updated_at: datetime
    is_low_stock: bool

    model_config = ConfigDict(from_attributes=True)
