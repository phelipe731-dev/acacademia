from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import StockMovementType
from app.schemas.product import ProductRead
from app.schemas.user import UserRead


class StockMovementCreate(BaseModel):
    product_id: int
    type: StockMovementType = StockMovementType.ENTRADA
    quantity: int = Field(..., description="Entrada usa valor positivo; ajuste aceita positivo ou negativo.")
    reason: str | None = None

    @model_validator(mode="after")
    def validate_quantity(self) -> "StockMovementCreate":
        if self.quantity == 0:
            raise ValueError("A quantidade nao pode ser zero.")
        if self.type == StockMovementType.ENTRADA and self.quantity < 0:
            raise ValueError("Entrada de estoque deve ter quantidade positiva.")
        if self.type == StockMovementType.SAIDA_VENDA:
            raise ValueError("Saida por venda deve ser gerada pelo modulo de vendas.")
        return self


class StockMovementRead(BaseModel):
    id: int
    product_id: int
    type: StockMovementType
    quantity: int
    reason: str | None
    created_by_id: int | None
    created_at: datetime
    product: ProductRead | None = None
    created_by: UserRead | None = None

    model_config = ConfigDict(from_attributes=True)
