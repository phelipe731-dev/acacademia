import calendar
from datetime import date

from sqlalchemy import case, func, select, update
from sqlalchemy.orm import Session

from app.models.enums import PaymentMethod, PaymentStatus, SaleInstallmentStatus, StudentStatus
from app.models.payment import Payment
from app.models.sale import SaleInstallment
from app.models.student import Student
from app.models.user import User
from app.services.audit import model_snapshot, record_audit
from app.services.sales import refresh_overdue_sale_installments


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
    overdue_sale_installments_count = db.scalar(
        select(func.count(SaleInstallment.id)).where(
            SaleInstallment.student_id == student_id,
            SaleInstallment.status == SaleInstallmentStatus.ATRASADA,
        )
    )
    student.status = StudentStatus.INADIMPLENTE if overdue_count or overdue_sale_installments_count else StudentStatus.ATIVO


def refresh_all_student_statuses(db: Session) -> None:
    refresh_overdue_payments(db)
    refresh_overdue_sale_installments(db)
    overdue_exists = (
        select(Payment.id)
        .where(
            Payment.student_id == Student.id,
            Payment.status == PaymentStatus.ATRASADO,
        )
        .exists()
    )
    overdue_sale_installment_exists = (
        select(SaleInstallment.id)
        .where(
            SaleInstallment.student_id == Student.id,
            SaleInstallment.status == SaleInstallmentStatus.ATRASADA,
        )
        .exists()
    )
    db.execute(
        update(Student)
        .where(Student.status != StudentStatus.INATIVO)
        .values(
            status=case(
                (overdue_exists | overdue_sale_installment_exists, StudentStatus.INADIMPLENTE),
                else_=StudentStatus.ATIVO,
            )
        )
    )


def due_date_for_month(year: int, month: int, due_day: int) -> date:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(due_day, last_day))


def next_due_date(due_day: int, reference: date | None = None) -> date:
    current_day = reference or date.today()
    due_date = due_date_for_month(current_day.year, current_day.month, due_day)
    if due_date >= current_day:
        return due_date

    year = current_day.year + 1 if current_day.month == 12 else current_day.year
    month = 1 if current_day.month == 12 else current_day.month + 1
    return due_date_for_month(year, month, due_day)


def create_initial_student_payment(db: Session, student: Student, current_user: User) -> Payment | None:
    if student.status != StudentStatus.ATIVO or student.monthly_fee <= 0:
        return None

    today = date.today()
    reference = max(today, student.plan_start_date or today)
    due_date = next_due_date(student.due_day, reference)
    if student.plan_end_date and due_date > student.plan_end_date:
        return None

    exists = db.scalar(
        select(Payment.id).where(
            Payment.student_id == student.id,
            Payment.due_date == due_date,
            Payment.status != PaymentStatus.CANCELADO,
        )
    )
    if exists:
        return None

    payment = Payment(
        student_id=student.id,
        amount=student.monthly_fee,
        due_date=due_date,
        paid_at=None,
        status=PaymentStatus.PENDENTE,
        payment_method=PaymentMethod.PIX,
        notes="Mensalidade inicial gerada no cadastro do aluno.",
        created_by_id=current_user.id,
    )
    normalize_payment_status(payment)
    db.add(payment)
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="PAYMENT",
        entity_id=payment.id,
        action="CREATE",
        summary=f"Mensalidade inicial criada para aluno #{student.id}.",
        after=model_snapshot(payment),
    )
    return payment


def generate_monthly_payments(db: Session, current_user: User, year: int, month: int) -> tuple[int, int, list[date]]:
    students = db.scalars(select(Student).where(Student.status == StudentStatus.ATIVO).order_by(Student.name)).all()
    generated = 0
    skipped = 0
    due_dates: list[date] = []

    for student in students:
        due_date = due_date_for_month(year, month, student.due_day)
        if student.plan_start_date and due_date < student.plan_start_date:
            continue
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
