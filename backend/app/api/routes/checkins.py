from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_roles
from app.core.tz import business_today, day_after_utc, day_start_utc
from app.db.session import get_db
from app.models.checkin import CheckIn
from app.models.enums import StudentStatus, UserRole
from app.models.student import Student
from app.models.user import User
from app.schemas.checkin import CheckInCreate, CheckInRead

router = APIRouter(prefix="/checkins", tags=["checkins"])

# Frequencia e uma tela de recepcao; PROFESSOR nao gerencia check-ins (so fichas de treino).
CHECKIN_ROLES = (UserRole.ADMIN, UserRole.RECEPCAO)


@router.post("", response_model=CheckInRead, status_code=status.HTTP_201_CREATED)
def register_checkin(
    payload: CheckInCreate,
    current_user: User = Depends(require_roles(*CHECKIN_ROLES)),
    db: Session = Depends(get_db),
) -> CheckIn:
    student = db.get(Student, payload.student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno nao encontrado.")
    if student.status == StudentStatus.INATIVO:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Aluno inativo nao pode fazer check-in.")

    checkin = CheckIn(student_id=student.id, created_by_id=current_user.id)
    db.add(checkin)
    db.commit()
    return db.scalars(
        select(CheckIn).where(CheckIn.id == checkin.id).options(selectinload(CheckIn.student))
    ).one()


@router.get("/today", response_model=list[CheckInRead])
def today_checkins(
    _: User = Depends(require_roles(*CHECKIN_ROLES)),
    db: Session = Depends(get_db),
) -> list[CheckIn]:
    today = business_today()
    return list(
        db.scalars(
            select(CheckIn)
            .where(CheckIn.checked_in_at >= day_start_utc(today), CheckIn.checked_in_at < day_after_utc(today))
            .options(selectinload(CheckIn.student))
            .order_by(CheckIn.checked_in_at.desc())
        ).all()
    )


@router.get("", response_model=list[CheckInRead])
def list_checkins(
    student_id: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    _: User = Depends(require_roles(*CHECKIN_ROLES)),
    db: Session = Depends(get_db),
) -> list[CheckIn]:
    stmt = select(CheckIn).options(selectinload(CheckIn.student)).order_by(CheckIn.checked_in_at.desc()).limit(limit)
    if student_id:
        stmt = stmt.where(CheckIn.student_id == student_id)
    return list(db.scalars(stmt).all())
