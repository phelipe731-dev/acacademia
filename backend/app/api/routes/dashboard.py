from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.tz import business_today, day_start_utc, to_business_date
from app.db.session import get_db
from app.models.enums import PaymentStatus, ProductStatus, StudentStatus, UserRole
from app.models.payment import Payment
from app.models.product import Product
from app.models.sale import Sale, SaleItem
from app.models.student import Student
from app.models.user import User
from app.schemas.dashboard import DashboardRead, RevenuePoint, TopProduct
from app.services.payments import refresh_all_student_statuses

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def month_bounds() -> tuple[date, date]:
    """Primeiro dia do mes atual e primeiro dia do mes seguinte (fuso de negocio)."""
    first = business_today().replace(day=1)
    if first.month == 12:
        next_month = first.replace(year=first.year + 1, month=1)
    else:
        next_month = first.replace(month=first.month + 1)
    return first, next_month


@router.get("", response_model=DashboardRead)
def read_dashboard(
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> DashboardRead:
    refresh_all_student_statuses(db)
    # Datas de negocio para colunas Date (paid_at); limites em UTC para o instante (created_at).
    start_day, end_day = month_bounds()
    start = day_start_utc(start_day)
    end = day_start_utc(end_day)

    active_students = db.scalar(select(func.count(Student.id)).where(Student.status == StudentStatus.ATIVO)) or 0
    defaulter_students = db.scalar(select(func.count(Student.id)).where(Student.status == StudentStatus.INADIMPLENTE)) or 0
    payments_received = db.scalar(
        select(func.coalesce(func.sum(Payment.amount), Decimal("0.00"))).where(
            Payment.status == PaymentStatus.PAGO,
            Payment.paid_at >= start_day,
            Payment.paid_at < end_day,
        )
    )
    overdue_payments = db.scalar(select(func.count(Payment.id)).where(Payment.status == PaymentStatus.ATRASADO)) or 0
    sales_month = db.scalar(
        select(func.coalesce(func.sum(Sale.total_amount), Decimal("0.00"))).where(
            Sale.created_at >= start,
            Sale.created_at < end,
        )
    )
    low_stock_products = list(
        db.scalars(
            select(Product)
            .where(Product.status == ProductStatus.ATIVO, Product.stock_quantity <= Product.min_stock)
            .order_by(Product.stock_quantity.asc(), Product.name)
            .limit(10)
        ).all()
    )
    top_rows = db.execute(
        select(
            Product.id,
            Product.name,
            func.coalesce(func.sum(SaleItem.quantity), 0).label("qty"),
            func.coalesce(func.sum(SaleItem.subtotal), Decimal("0.00")).label("total"),
        )
        .join(SaleItem, SaleItem.product_id == Product.id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(Sale.created_at >= start, Sale.created_at < end)
        .group_by(Product.id, Product.name)
        .order_by(desc("qty"))
        .limit(5)
    ).all()

    payment_points = {
        row[0]: row[1]
        for row in db.execute(
            select(Payment.paid_at, func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
            .where(
                Payment.status == PaymentStatus.PAGO,
                Payment.paid_at >= start_day,
                Payment.paid_at < end_day,
            )
            .group_by(Payment.paid_at)
        ).all()
    }
    # Agrupa as vendas por data LOCAL de negocio (o instante e convertido em Python),
    # em vez de func.date() do banco, que usaria a data em UTC.
    sale_points: dict[str, Decimal] = {}
    for created_at, total_amount in db.execute(
        select(Sale.created_at, Sale.total_amount).where(Sale.created_at >= start, Sale.created_at < end)
    ).all():
        key = to_business_date(created_at).isoformat()
        sale_points[key] = sale_points.get(key, Decimal("0.00")) + total_amount

    today = business_today()
    same_month = today.year == start_day.year and today.month == start_day.month
    days_in_scope = today.day if same_month else (end_day - start_day).days
    revenue_points: list[RevenuePoint] = []
    for day in range(1, days_in_scope + 1):
        current_date = start_day.replace(day=day)
        sale_key = current_date.isoformat()
        point_payments = payment_points.get(current_date, Decimal("0.00"))
        point_sales = sale_points.get(sale_key, Decimal("0.00"))
        revenue_points.append(
            RevenuePoint(
                label=f"{day:02d}",
                payments=point_payments,
                sales=point_sales,
                total=(point_payments + point_sales).quantize(Decimal("0.01")),
            )
        )
    db.commit()

    payments_total = payments_received or Decimal("0.00")
    sales_total = sales_month or Decimal("0.00")
    return DashboardRead(
        active_students=active_students,
        defaulter_students=defaulter_students,
        payments_received_month=payments_total,
        overdue_payments=overdue_payments,
        sales_month=sales_total,
        revenue_month=(payments_total + sales_total).quantize(Decimal("0.01")),
        low_stock_products=low_stock_products,
        top_products=[TopProduct(product_id=row[0], name=row[1], quantity=row[2], total=row[3]) for row in top_rows],
        revenue_points=revenue_points,
    )
