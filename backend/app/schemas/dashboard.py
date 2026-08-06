from decimal import Decimal

from pydantic import BaseModel, Field

from app.schemas.engagement import BirthdayRow, ExpiringPlanRow
from app.schemas.product import ProductRead


class TopProduct(BaseModel):
    product_id: int
    name: str
    quantity: int
    total: Decimal


class RevenuePoint(BaseModel):
    label: str
    payments: Decimal
    sales: Decimal
    total: Decimal


class DashboardRead(BaseModel):
    active_students: int
    defaulter_students: int
    payments_received_month: Decimal
    overdue_payments: int
    sales_month: Decimal
    revenue_month: Decimal
    low_stock_products: list[ProductRead]
    top_products: list[TopProduct]
    revenue_points: list[RevenuePoint]
    birthdays: list[BirthdayRow] = Field(default_factory=list)
    expiring_plans: list[ExpiringPlanRow] = Field(default_factory=list)
