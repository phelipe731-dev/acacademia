from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class PaymentReportRow(BaseModel):
    id: int
    student_name: str
    amount: Decimal
    paid_at: date | None
    due_date: date
    payment_method: str


class DefaulterReportRow(BaseModel):
    student_id: int
    student_name: str
    phone: str
    overdue_amount: Decimal
    oldest_due_date: date


class SaleReportRow(BaseModel):
    id: int
    created_at: datetime
    payment_method: str
    total_amount: Decimal
    user_name: str | None
    items_count: int


class TopProductReportRow(BaseModel):
    product_id: int
    name: str
    quantity: int
    total: Decimal


class RevenueReport(BaseModel):
    start_date: date
    end_date: date
    payments_total: Decimal
    sales_total: Decimal
    total: Decimal
