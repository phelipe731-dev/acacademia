from datetime import timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, require_roles
from app.core.tz import business_today, to_business_date
from app.db.session import get_db
from app.models.checkin import CheckIn
from app.models.enums import StudentStatus, UserRole
from app.models.payment import Payment
from app.models.student import Student
from app.models.user import User
from app.schemas.common import APIMessage
from app.schemas.engagement import BirthdayRow, ExpiringPlanRow, InactiveStudentRow
from app.schemas.payment import PaymentRead
from app.schemas.imports import StudentImportResult
from app.schemas.student import StudentCreate, StudentRead, StudentUpdate
from app.services.audit import model_snapshot, record_audit
from app.services.imports import import_students_from_file
from app.services.payments import refresh_all_student_statuses
from app.services.students import ensure_student_is_unique

router = APIRouter(prefix="/students", tags=["students"])


@router.get("", response_model=list[StudentRead])
def list_students(
    search: str | None = Query(default=None),
    status_filter: StudentStatus | None = Query(default=None, alias="status"),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Student]:
    refresh_all_student_statuses(db)
    stmt = select(Student).order_by(Student.name)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(or_(Student.name.ilike(like), Student.phone.ilike(like)))
    if status_filter:
        stmt = stmt.where(Student.status == status_filter)
    students = list(db.scalars(stmt).all())
    db.commit()
    return students


@router.post("", response_model=StudentRead, status_code=status.HTTP_201_CREATED)
def create_student(
    payload: StudentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Student:
    ensure_student_is_unique(db, cpf=payload.cpf, email=payload.email)
    student = Student(**payload.model_dump())
    db.add(student)
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="STUDENT",
        entity_id=student.id,
        action="CREATE",
        summary=f"Aluno cadastrado: {student.name}.",
        after=model_snapshot(student),
    )
    db.commit()
    db.refresh(student)
    return student


@router.get("/inactive", response_model=list[InactiveStudentRow])
def inactive_students(
    days: int = Query(default=15, ge=1, le=365),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[InactiveStudentRow]:
    """Alunos ativos que nao aparecem ha 'days' dias (risco de cancelamento)."""
    last_checkin = (
        select(CheckIn.student_id, func.max(CheckIn.checked_in_at).label("last"))
        .group_by(CheckIn.student_id)
        .subquery()
    )
    rows = db.execute(
        select(Student.id, Student.name, Student.phone, Student.created_at, last_checkin.c.last)
        .outerjoin(last_checkin, last_checkin.c.student_id == Student.id)
        .where(Student.status != StudentStatus.INATIVO)
    ).all()

    today = business_today()
    result: list[InactiveStudentRow] = []
    for student_id, name, phone, created_at, last in rows:
        # Baseline: ultimo check-in ou, se nunca veio, a data de cadastro.
        baseline = to_business_date(last) if last is not None else to_business_date(created_at)
        days_since = (today - baseline).days
        if days_since >= days:
            result.append(
                InactiveStudentRow(
                    student_id=student_id,
                    name=name,
                    phone=phone,
                    last_checkin=to_business_date(last) if last is not None else None,
                    days_since=days_since,
                )
            )
    result.sort(key=lambda row: row.days_since or 0, reverse=True)
    return result


@router.get("/expiring-plans", response_model=list[ExpiringPlanRow])
def expiring_plans(
    days: int = Query(default=15, ge=1, le=365),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ExpiringPlanRow]:
    """Alunos cujo plano vence nos proximos 'days' dias (ou ja venceu)."""
    today = business_today()
    limit = today + timedelta(days=days)
    rows = db.scalars(
        select(Student)
        .where(
            Student.status != StudentStatus.INATIVO,
            Student.plan_end_date.is_not(None),
            Student.plan_end_date <= limit,
        )
        .order_by(Student.plan_end_date)
    ).all()
    return [
        ExpiringPlanRow(
            student_id=student.id,
            name=student.name,
            phone=student.phone,
            plan=student.plan,
            plan_end_date=student.plan_end_date,
            days_left=(student.plan_end_date - today).days,
        )
        for student in rows
    ]


@router.get("/birthdays", response_model=list[BirthdayRow])
def birthdays(
    month: int | None = Query(default=None, ge=1, le=12),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BirthdayRow]:
    """Aniversariantes do mes (padrao: mes atual)."""
    target_month = month or business_today().month
    students = db.scalars(
        select(Student).where(
            Student.status != StudentStatus.INATIVO,
            Student.birth_date.is_not(None),
            func.extract("month", Student.birth_date) == target_month,
        )
    ).all()
    rows = [
        BirthdayRow(
            student_id=student.id,
            name=student.name,
            phone=student.phone,
            birth_date=student.birth_date,
            day=student.birth_date.day,
        )
        for student in students
    ]
    rows.sort(key=lambda row: row.day)
    return rows


@router.post("/import", response_model=StudentImportResult)
async def import_students(
    file: UploadFile = File(...),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> StudentImportResult:
    return await import_students_from_file(db, file, current_user)


@router.get("/{student_id}", response_model=StudentRead)
def get_student(
    student_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Student:
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno nao encontrado.")
    return student


@router.patch("/{student_id}", response_model=StudentRead)
def update_student(
    student_id: int,
    payload: StudentUpdate,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> Student:
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno nao encontrado.")
    before = model_snapshot(student)
    updates = payload.model_dump(exclude_unset=True)
    ensure_student_is_unique(
        db,
        cpf=updates.get("cpf") if "cpf" in updates else None,
        email=updates.get("email") if "email" in updates else None,
        exclude_id=student_id,
    )
    for field, value in updates.items():
        setattr(student, field, value)
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="STUDENT",
        entity_id=student.id,
        action="UPDATE",
        summary=f"Aluno atualizado: {student.name}.",
        before=before,
        after=model_snapshot(student),
    )
    db.commit()
    db.refresh(student)
    return student


@router.delete("/{student_id}", response_model=APIMessage)
def delete_student(
    student_id: int,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> APIMessage:
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno nao encontrado.")
    before = model_snapshot(student)
    record_audit(
        db,
        current_user,
        entity_type="STUDENT",
        entity_id=student.id,
        action="DELETE",
        summary=f"Aluno excluido: {student.name}.",
        before=before,
    )
    db.delete(student)
    db.commit()
    return APIMessage(message="Aluno excluido.")


@router.get("/{student_id}/payments", response_model=list[PaymentRead])
def list_student_payments(
    student_id: int,
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> list[Payment]:
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno nao encontrado.")
    return list(
        db.scalars(
            select(Payment)
            .where(Payment.student_id == student_id)
            .options(selectinload(Payment.created_by))
            .order_by(Payment.due_date.desc())
        ).all()
    )
