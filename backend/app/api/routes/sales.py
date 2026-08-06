from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.tz import business_today
from app.db.session import get_db
from app.models.enums import PaymentMethod, SaleInstallmentStatus, SaleStatus, UserRole
from app.models.sale import Sale, SaleInstallment
from app.models.user import User
from app.schemas.sale import SaleCancel, SaleCreate, SaleInstallmentPay, SaleInstallmentRead, SaleRead
from app.services.audit import model_snapshot, record_audit
from app.services.payments import update_student_status_from_payments
from app.services.sales import (
    cancel_sale_with_stock,
    create_sale_with_stock,
    normalize_sale_installment_status,
    refresh_overdue_sale_installments,
    sale_load_options,
)

router = APIRouter(prefix="/sales", tags=["sales"])


@router.get("", response_model=list[SaleRead])
def list_sales(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    student_id: int | None = Query(default=None),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> list[Sale]:
    stmt = (
        select(Sale)
        .options(*sale_load_options())
        .order_by(Sale.created_at.desc())
    )
    if start_date:
        stmt = stmt.where(Sale.created_at >= datetime.combine(start_date, time.min))
    if end_date:
        stmt = stmt.where(Sale.created_at <= datetime.combine(end_date, time.max))
    if student_id:
        stmt = stmt.where(Sale.student_id == student_id)
    return list(db.scalars(stmt).all())


@router.get("/installments", response_model=list[SaleInstallmentRead])
def list_sale_installments(
    student_id: int | None = Query(default=None),
    status_filter: SaleInstallmentStatus | None = Query(default=None, alias="status"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> list[SaleInstallment]:
    refresh_overdue_sale_installments(db)
    stmt = select(SaleInstallment).order_by(SaleInstallment.due_date.desc(), SaleInstallment.id.desc())
    if student_id:
        stmt = stmt.where(SaleInstallment.student_id == student_id)
    if status_filter:
        stmt = stmt.where(SaleInstallment.status == status_filter)
    if start_date:
        stmt = stmt.where(SaleInstallment.due_date >= start_date)
    if end_date:
        stmt = stmt.where(SaleInstallment.due_date <= end_date)
    installments = list(db.scalars(stmt).all())
    db.commit()
    return installments


@router.post("", response_model=SaleRead, status_code=status.HTTP_201_CREATED)
def create_sale(
    payload: SaleCreate,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> Sale:
    return create_sale_with_stock(db, payload, current_user)


@router.patch("/installments/{installment_id}/pay", response_model=SaleInstallmentRead)
def pay_sale_installment(
    installment_id: int,
    payload: SaleInstallmentPay,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> SaleInstallment:
    installment = db.get(SaleInstallment, installment_id)
    if installment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fatura da venda nao encontrada.")
    if installment.status == SaleInstallmentStatus.CANCELADA:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fatura cancelada nao pode ser paga.")
    if installment.sale.status == SaleStatus.CANCELADA:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Venda cancelada nao pode receber pagamento.")

    before = model_snapshot(installment)
    installment.status = SaleInstallmentStatus.PAGA
    installment.paid_at = payload.paid_at or business_today()
    installment.payment_method = (
        payload.payment_method
        or installment.payment_method
        or installment.sale.installment_payment_method
        or PaymentMethod.PIX
    )
    if payload.notes is not None:
        installment.notes = payload.notes
    normalize_sale_installment_status(installment)
    db.flush()
    update_student_status_from_payments(db, installment.student_id)
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="SALE_INSTALLMENT",
        entity_id=installment.id,
        action="PAY",
        summary=f"Fatura de venda paga #{installment.id}.",
        before=before,
        after=model_snapshot(installment),
    )
    db.commit()
    db.refresh(installment)
    return installment


@router.patch("/{sale_id}/cancel", response_model=SaleRead)
def cancel_sale(
    sale_id: int,
    payload: SaleCancel,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> Sale:
    return cancel_sale_with_stock(db, sale_id, current_user, payload.reason)
