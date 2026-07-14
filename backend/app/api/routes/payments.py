from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.enums import PaymentStatus, UserRole
from app.models.payment import Payment
from app.models.student import Student
from app.models.user import User
from app.schemas.payment import PaymentCreate, PaymentRead, PaymentUpdate, PaymentWithStudent
from app.schemas.generation import MonthlyPaymentsGenerateRequest, MonthlyPaymentsGenerateResult
from app.schemas.report import DefaulterReportRow
from app.services.audit import model_snapshot, record_audit
from app.services.payments import (
    generate_monthly_payments,
    normalize_payment_status,
    refresh_all_student_statuses,
    update_student_status_from_payments,
)

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("", response_model=list[PaymentWithStudent])
def list_payments(
    status_filter: PaymentStatus | None = Query(default=None, alias="status"),
    student_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> list[Payment]:
    refresh_all_student_statuses(db)
    stmt = select(Payment).options(selectinload(Payment.student), selectinload(Payment.created_by)).order_by(Payment.due_date.desc())
    if status_filter:
        stmt = stmt.where(Payment.status == status_filter)
    if student_id:
        stmt = stmt.where(Payment.student_id == student_id)
    if start_date:
        stmt = stmt.where(Payment.due_date >= start_date)
    if end_date:
        stmt = stmt.where(Payment.due_date <= end_date)
    payments = list(db.scalars(stmt).all())
    db.commit()
    return payments


@router.post("", response_model=PaymentRead, status_code=status.HTTP_201_CREATED)
def create_payment(
    payload: PaymentCreate,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> Payment:
    student = db.get(Student, payload.student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno nao encontrado.")
    payment = Payment(**payload.model_dump(), created_by_id=current_user.id)
    normalize_payment_status(payment)
    db.add(payment)
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="PAYMENT",
        entity_id=payment.id,
        action="CREATE",
        summary=f"Mensalidade registrada para aluno #{student.id}.",
        after=model_snapshot(payment),
    )
    update_student_status_from_payments(db, student.id)
    db.commit()
    db.refresh(payment)
    return payment


@router.patch("/{payment_id}", response_model=PaymentRead)
def update_payment(
    payment_id: int,
    payload: PaymentUpdate,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> Payment:
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mensalidade nao encontrada.")
    before = model_snapshot(payment)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(payment, field, value)
    if payment.created_by_id is None:
        payment.created_by_id = current_user.id
    normalize_payment_status(payment)
    # flush antes de recalcular: com autoflush=False, a contagem de parcelas atrasadas
    # precisa enxergar o novo status ja persistido, senao o aluno fica com status obsoleto.
    db.flush()
    update_student_status_from_payments(db, payment.student_id)
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="PAYMENT",
        entity_id=payment.id,
        action="UPDATE",
        summary=f"Mensalidade atualizada #{payment.id}.",
        before=before,
        after=model_snapshot(payment),
    )
    db.commit()
    db.refresh(payment)
    return payment


@router.patch("/{payment_id}/pay", response_model=PaymentRead)
def mark_payment_paid(
    payment_id: int,
    payload: PaymentUpdate,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> Payment:
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mensalidade nao encontrada.")
    before = model_snapshot(payment)
    payment.status = PaymentStatus.PAGO
    payment.paid_at = payload.paid_at or date.today()
    if payload.payment_method:
        payment.payment_method = payload.payment_method
    if payload.notes is not None:
        payment.notes = payload.notes
    if payment.created_by_id is None:
        payment.created_by_id = current_user.id
    normalize_payment_status(payment)
    # flush antes de recalcular o status do aluno (ver update_payment).
    db.flush()
    update_student_status_from_payments(db, payment.student_id)
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="PAYMENT",
        entity_id=payment.id,
        action="PAY",
        summary=f"Mensalidade marcada como paga #{payment.id}.",
        before=before,
        after=model_snapshot(payment),
    )
    db.commit()
    db.refresh(payment)
    return payment


@router.get("/upcoming", response_model=list[PaymentWithStudent])
def upcoming_payments(
    days: int = Query(default=7, ge=1, le=60),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> list[Payment]:
    today = date.today()
    limit = today + timedelta(days=days)
    return list(
        db.scalars(
            select(Payment)
            .where(Payment.status == PaymentStatus.PENDENTE, Payment.due_date >= today, Payment.due_date <= limit)
            .options(selectinload(Payment.student), selectinload(Payment.created_by))
            .order_by(Payment.due_date)
        ).all()
    )


@router.get("/defaulters", response_model=list[DefaulterReportRow])
def defaulters(
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


@router.post("/generate-monthly", response_model=MonthlyPaymentsGenerateResult)
def generate_monthly(
    payload: MonthlyPaymentsGenerateRequest,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> MonthlyPaymentsGenerateResult:
    generated, skipped, due_dates = generate_monthly_payments(db, current_user, payload.year, payload.month)
    return MonthlyPaymentsGenerateResult(
        year=payload.year,
        month=payload.month,
        generated=generated,
        skipped_existing=skipped,
        due_dates=due_dates,
    )
