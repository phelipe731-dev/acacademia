import csv
from datetime import date
from decimal import Decimal
from io import StringIO

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.tz import business_today, day_after_utc, day_start_utc
from app.db.session import get_db
from app.models.enums import PaymentStatus, ProductStatus, UserRole
from app.models.payment import Payment
from app.models.product import Product
from app.models.sale import Sale, SaleItem
from app.models.student import Student
from app.models.user import User
from app.schemas.product import ProductRead
from app.schemas.report import (
    DefaulterReportRow,
    PaymentReportRow,
    RevenueReport,
    SaleReportRow,
    TopProductReportRow,
)
from app.services.payments import refresh_all_student_statuses

router = APIRouter(prefix="/reports", tags=["reports"])


def default_dates(start_date: date | None, end_date: date | None) -> tuple[date, date]:
    today = business_today()
    return start_date or today.replace(day=1), end_date or today


# Caracteres que, no inicio de uma celula, sao interpretados como formula por
# Excel/Sheets. Prefixamos com apostrofo para neutralizar (CSV formula injection).
_CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def sanitize_csv_value(value: object) -> object:
    if isinstance(value, str) and value and value[0] in _CSV_FORMULA_PREFIXES:
        return "'" + value
    return value


def csv_response(filename: str, rows: list[dict[str, object]]) -> Response:
    output = StringIO()
    if rows:
        writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()), delimiter=";")
        writer.writeheader()
        writer.writerows({key: sanitize_csv_value(value) for key, value in row.items()} for row in rows)
    else:
        output.write("")
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/payments-received", response_model=list[PaymentReportRow])
def payments_received_report(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> list[PaymentReportRow]:
    start, end = default_dates(start_date, end_date)
    rows = db.execute(
        select(Payment.id, Student.name, Payment.amount, Payment.paid_at, Payment.due_date, Payment.payment_method)
        .join(Student, Student.id == Payment.student_id)
        .where(Payment.status == PaymentStatus.PAGO, Payment.paid_at >= start, Payment.paid_at <= end)
        .order_by(Payment.paid_at.desc())
    ).all()
    return [
        PaymentReportRow(
            id=row[0],
            student_name=row[1],
            amount=row[2],
            paid_at=row[3],
            due_date=row[4],
            payment_method=row[5].value if hasattr(row[5], "value") else str(row[5]),
        )
        for row in rows
    ]


@router.get("/payments-received.csv")
def payments_received_csv(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> Response:
    rows = payments_received_report(start_date, end_date, _, db)
    return csv_response(
        "mensalidades-recebidas.csv",
        [
            {
                "id": row.id,
                "aluno": row.student_name,
                "valor": row.amount,
                "pagamento": row.paid_at,
                "vencimento": row.due_date,
                "forma": row.payment_method,
            }
            for row in rows
        ],
    )


@router.get("/defaulters", response_model=list[DefaulterReportRow])
def defaulters_report(
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> list[DefaulterReportRow]:
    refresh_all_student_statuses(db)
    rows = db.execute(
        select(
            Student.id,
            Student.name,
            Student.phone,
            func.coalesce(func.sum(Payment.amount), Decimal("0.00")),
            func.min(Payment.due_date),
        )
        .join(Payment, Payment.student_id == Student.id)
        .where(Payment.status == PaymentStatus.ATRASADO)
        .group_by(Student.id, Student.name, Student.phone)
        .order_by(func.min(Payment.due_date))
    ).all()
    db.commit()
    return [
        DefaulterReportRow(
            student_id=row[0],
            student_name=row[1],
            phone=row[2],
            overdue_amount=row[3],
            oldest_due_date=row[4],
        )
        for row in rows
    ]


@router.get("/defaulters.csv")
def defaulters_csv(
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> Response:
    rows = defaulters_report(_, db)
    return csv_response(
        "inadimplentes.csv",
        [
            {
                "student_id": row.student_id,
                "aluno": row.student_name,
                "telefone": row.phone,
                "valor_em_atraso": row.overdue_amount,
                "vencimento_mais_antigo": row.oldest_due_date,
            }
            for row in rows
        ],
    )


@router.get("/sales", response_model=list[SaleReportRow])
def sales_report(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> list[SaleReportRow]:
    start, end = default_dates(start_date, end_date)
    rows = db.execute(
        select(
            Sale.id,
            Sale.created_at,
            Sale.payment_method,
            Sale.total_amount,
            User.name,
            func.coalesce(func.sum(SaleItem.quantity), 0),
        )
        .join(SaleItem, SaleItem.sale_id == Sale.id)
        .outerjoin(User, User.id == Sale.created_by_id)
        .where(
            Sale.created_at >= day_start_utc(start),
            Sale.created_at < day_after_utc(end),
        )
        .group_by(Sale.id, Sale.created_at, Sale.payment_method, Sale.total_amount, User.name)
        .order_by(Sale.created_at.desc())
    ).all()
    return [
        SaleReportRow(
            id=row[0],
            created_at=row[1],
            payment_method=row[2].value if hasattr(row[2], "value") else str(row[2]),
            total_amount=row[3],
            user_name=row[4],
            items_count=row[5],
        )
        for row in rows
    ]


@router.get("/sales.csv")
def sales_csv(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> Response:
    rows = sales_report(start_date, end_date, _, db)
    return csv_response(
        "vendas.csv",
        [
            {
                "id": row.id,
                "data": row.created_at,
                "forma": row.payment_method,
                "total": row.total_amount,
                "usuario": row.user_name,
                "itens": row.items_count,
            }
            for row in rows
        ],
    )


@router.get("/top-products", response_model=list[TopProductReportRow])
def top_products_report(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> list[TopProductReportRow]:
    start, end = default_dates(start_date, end_date)
    rows = db.execute(
        select(
            Product.id,
            Product.name,
            func.coalesce(func.sum(SaleItem.quantity), 0),
            func.coalesce(func.sum(SaleItem.subtotal), Decimal("0.00")),
        )
        .join(SaleItem, SaleItem.product_id == Product.id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(
            Sale.created_at >= day_start_utc(start),
            Sale.created_at < day_after_utc(end),
        )
        .group_by(Product.id, Product.name)
        .order_by(desc(func.sum(SaleItem.quantity)))
    ).all()
    return [
        TopProductReportRow(product_id=row[0], name=row[1], quantity=row[2], total=row[3])
        for row in rows
    ]


@router.get("/top-products.csv")
def top_products_csv(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> Response:
    rows = top_products_report(start_date, end_date, _, db)
    return csv_response(
        "produtos-mais-vendidos.csv",
        [
            {"product_id": row.product_id, "produto": row.name, "quantidade": row.quantity, "total": row.total}
            for row in rows
        ],
    )


@router.get("/low-stock", response_model=list[ProductRead])
def low_stock_report(
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> list[Product]:
    return list(
        db.scalars(
            select(Product)
            .where(Product.status == ProductStatus.ATIVO, Product.stock_quantity <= Product.min_stock)
            .order_by(Product.stock_quantity.asc(), Product.name)
        ).all()
    )


@router.get("/low-stock.csv")
def low_stock_csv(
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> Response:
    rows = low_stock_report(_, db)
    return csv_response(
        "estoque-baixo.csv",
        [
            {
                "id": row.id,
                "produto": row.name,
                "categoria": row.category,
                "estoque": row.stock_quantity,
                "estoque_minimo": row.min_stock,
                "preco_venda": row.sale_price,
            }
            for row in rows
        ],
    )


@router.get("/revenue", response_model=RevenueReport)
def revenue_report(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> RevenueReport:
    start, end = default_dates(start_date, end_date)
    payments_total = db.scalar(
        select(func.coalesce(func.sum(Payment.amount), Decimal("0.00"))).where(
            Payment.status == PaymentStatus.PAGO,
            Payment.paid_at >= start,
            Payment.paid_at <= end,
        )
    ) or Decimal("0.00")
    sales_total = db.scalar(
        select(func.coalesce(func.sum(Sale.total_amount), Decimal("0.00"))).where(
            Sale.created_at >= day_start_utc(start),
            Sale.created_at < day_after_utc(end),
        )
    ) or Decimal("0.00")
    return RevenueReport(
        start_date=start,
        end_date=end,
        payments_total=payments_total,
        sales_total=sales_total,
        total=(payments_total + sales_total).quantize(Decimal("0.01")),
    )


@router.get("/revenue.csv")
def revenue_csv(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> Response:
    row = revenue_report(start_date, end_date, _, db)
    return csv_response(
        "receita-geral.csv",
        [
            {
                "inicio": row.start_date,
                "fim": row.end_date,
                "mensalidades": row.payments_total,
                "vendas": row.sales_total,
                "total": row.total,
            }
        ],
    )
