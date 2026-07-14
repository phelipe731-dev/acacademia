import calendar
from datetime import date

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.enums import PaymentMethod, PaymentStatus, StudentStatus
from app.models.payment import Payment
from app.models.student import Student
from app.models.user import User
from app.services.audit import record_audit


def normalize_payment_status(payment: Payment, today: date | None = None) -> None:
    current_day = today or date.today()
    if payment.status == PaymentStatus.PAGO:
        if payment.paid_at is None:
            payment.paid_at = current_day
        return
    if payment.status == PaymentStatus.CANCELADO:
        return
    payment.status = PaymentStatus.ATRASADO if payment.due_date < current_day else PaymentStatus.PENDENTE


def refresh_overdue_payments(db: Session, today: date | None = None) -> None:
    current_day = today or date.today()
    db.execute(
        update(Payment)
        .where(Payment.status == PaymentStatus.PENDENTE, Payment.due_date < current_day)
        .values(status=PaymentStatus.ATRASADO)
    )


def update_student_status_from_payments(db: Session, student_id: int) -> None:
    student = db.get(Student, student_id)
    if not student or student.status == StudentStatus.INATIVO:
        return

    overdue_count = db.scalar(
        select(func.count(Payment.id)).where(
            Payment.student_id == student_id,
            Payment.status == PaymentStatus.ATRASADO,
        )
    )
    student.status = StudentStatus.INADIMPLENTE if overdue_count else StudentStatus.ATIVO


def refresh_all_student_statuses(db: Session) -> None:
    refresh_overdue_payments(db)
    student_ids = db.scalars(select(Student.id)).all()
    for student_id in student_ids:
        update_student_status_from_payments(db, student_id)


def due_date_for_month(year: int, month: int, due_day: int) -> date:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(due_day, last_day))


def generate_monthly_payments(db: Session, current_user: User, year: int, month: int) -> tuple[int, int, list[date]]:
    students = db.scalars(select(Student).where(Student.status == StudentStatus.ATIVO).order_by(Student.name)).all()
    generated = 0
    skipped = 0
    due_dates: list[date] = []

    for student in students:
        due_date = due_date_for_month(year, month, student.due_day)
        exists = db.scalar(
            select(Payment.id).where(
                Payment.student_id == student.id,
                Payment.due_date == due_date,
                Payment.status != PaymentStatus.CANCELADO,
            )
        )
        if exists:
            skipped += 1
            continue

        payment = Payment(
            student_id=student.id,
            amount=student.monthly_fee,
            due_date=due_date,
            paid_at=None,
            status=PaymentStatus.PENDENTE,
            payment_method=PaymentMethod.PIX,
            notes=f"Mensalidade gerada automaticamente {month:02d}/{year}",
            created_by_id=current_user.id,
        )
        normalize_payment_status(payment)
        db.add(payment)
        generated += 1
        due_dates.append(due_date)

    record_audit(
        db,
        current_user,
        entity_type="PAYMENT",
        action="GENERATE_MONTHLY",
        summary=f"Geracao automatica de mensalidades {month:02d}/{year}: {generated} criadas, {skipped} ja existentes.",
        after={"year": year, "month": month, "generated": generated, "skipped_existing": skipped},
    )
    db.commit()
    return generated, skipped, due_dates
