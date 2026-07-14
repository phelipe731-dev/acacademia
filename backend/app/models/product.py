from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, Enum, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ProductStatus


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    category: Mapped[str | None] = mapped_column(String(120), nullable=True)
    cost_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    sale_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    min_stock: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[ProductStatus] = mapped_column(
        Enum(ProductStatus, name="product_status", native_enum=False),
        default=ProductStatus.ATIVO,
        index=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    stock_movements = relationship("StockMovement", back_populates="product")
    sale_items = relationship("SaleItem", back_populates="product")

    @property
    def is_low_stock(self) -> bool:
        return self.stock_quantity <= self.min_stock
