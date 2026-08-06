import calendar
from datetime import date
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.tz import business_today
from app.models.enums import ProductStatus, SaleInstallmentStatus, SalePaymentMethod, StockMovementType, StudentStatus
from app.models.product import Product
from app.models.sale import Sale, SaleInstallment, SaleItem
from app.models.stock import StockMovement
from app.models.student import Student
from app.models.user import User
from app.schemas.sale import SaleCreate
from app.services.audit import model_snapshot, record_audit


def add_months(day: date, months: int) -> date:
    month_index = day.month - 1 + months
    year = day.year + month_index // 12
    month = month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(day.day, last_day))


def split_installment_amounts(total: Decimal, installments_count: int) -> list[Decimal]:
    total_cents = int((total * 100).quantize(Decimal("1")))
    base = total_cents // installments_count
    remainder = total_cents % installments_count
    return [
        (Decimal(base + (1 if index < remainder else 0)) / Decimal(100)).quantize(Decimal("0.01"))
        for index in range(installments_count)
    ]


def normalize_sale_installment_status(installment: SaleInstallment, today: date | None = None) -> None:
    current_day = today or business_today()
    if installment.status == SaleInstallmentStatus.PAGA:
        if installment.paid_at is None:
            installment.paid_at = current_day
        return
    if installment.status == SaleInstallmentStatus.CANCELADA:
        return
    installment.status = SaleInstallmentStatus.ATRASADA if installment.due_date < current_day else SaleInstallmentStatus.ABERTA


def refresh_overdue_sale_installments(db: Session, today: date | None = None) -> None:
    current_day = today or business_today()
    installments = db.scalars(
        select(SaleInstallment).where(
            SaleInstallment.status == SaleInstallmentStatus.ABERTA,
            SaleInstallment.due_date < current_day,
        )
    ).all()
    for installment in installments:
        installment.status = SaleInstallmentStatus.ATRASADA


def create_sale_installments(db: Session, sale: Sale, payload: SaleCreate) -> list[SaleInstallment]:
    if payload.payment_method != SalePaymentMethod.PRAZO or payload.first_due_date is None:
        return []

    amounts = split_installment_amounts(sale.total_amount, payload.installments_count)
    today = business_today()
    installments: list[SaleInstallment] = []
    for index, amount in enumerate(amounts, start=1):
        installment = SaleInstallment(
            sale_id=sale.id,
            student_id=sale.student_id,
            installment_number=index,
            amount=amount,
            due_date=add_months(payload.first_due_date, index - 1),
            paid_at=None,
            status=SaleInstallmentStatus.ABERTA,
            payment_method=None,
            notes=payload.notes,
        )
        normalize_sale_installment_status(installment, today=today)
        db.add(installment)
        installments.append(installment)
    return installments


def create_sale_with_stock(db: Session, payload: SaleCreate, current_user: User) -> Sale:
    student = db.get(Student, payload.student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno nao encontrado.")

    product_ids = [item.product_id for item in payload.items]
    # with_for_update() serializa a baixa de estoque: duas vendas simultaneas do mesmo
    # produto nao conseguem ler o saldo ao mesmo tempo, evitando venda a descoberto.
    # (Em SQLite, usado nos testes, o lock e um no-op silencioso.)
    products = {
        product.id: product
        for product in db.scalars(
            select(Product).where(Product.id.in_(product_ids)).with_for_update()
        ).all()
    }

    total_by_product: dict[int, int] = {}
    for item in payload.items:
        total_by_product[item.product_id] = total_by_product.get(item.product_id, 0) + item.quantity

    for product_id, requested_qty in total_by_product.items():
        product = products.get(product_id)
        if product is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto nao encontrado.")
        if product.status != ProductStatus.ATIVO:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Produto inativo: {product.name}.")
        if product.stock_quantity < requested_qty:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Estoque insuficiente para {product.name}. Disponivel: {product.stock_quantity}.",
            )

    sale = Sale(
        student_id=student.id,
        payment_method=payload.payment_method,
        installments_count=payload.installments_count,
        installment_payment_method=payload.installment_payment_method,
        notes=payload.notes,
        created_by_id=current_user.id,
        total_amount=0,
    )
    db.add(sale)
    db.flush()

    total = Decimal("0.00")
    for item in payload.items:
        product = products[item.product_id]
        unit_price = product.sale_price
        subtotal = (unit_price * item.quantity).quantize(Decimal("0.01"))
        product.stock_quantity -= item.quantity
        total += subtotal

        db.add(
            SaleItem(
                sale_id=sale.id,
                product_id=product.id,
                quantity=item.quantity,
                unit_price=unit_price,
                subtotal=subtotal,
            )
        )
        db.add(
            StockMovement(
                product_id=product.id,
                type=StockMovementType.SAIDA_VENDA,
                quantity=item.quantity,
                reason=f"Venda #{sale.id}",
                created_by_id=current_user.id,
            )
        )

    sale.total_amount = total.quantize(Decimal("0.01"))
    installments = create_sale_installments(db, sale, payload)
    if student.status != StudentStatus.INATIVO and any(
        installment.status == SaleInstallmentStatus.ATRASADA for installment in installments
    ):
        student.status = StudentStatus.INADIMPLENTE
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="SALE",
        entity_id=sale.id,
        action="CREATE",
        summary=f"Venda registrada #{sale.id} para {student.name} no valor de {sale.total_amount}.",
        after=model_snapshot(sale),
    )
    db.commit()
    return db.scalars(
        select(Sale)
        .where(Sale.id == sale.id)
        .options(
            selectinload(Sale.items).selectinload(SaleItem.product),
            selectinload(Sale.installments),
            selectinload(Sale.created_by),
            selectinload(Sale.student),
        )
    ).one()
