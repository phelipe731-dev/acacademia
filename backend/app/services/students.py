from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.student import Student


def ensure_student_is_unique(
    db: Session,
    *,
    cpf: str | None,
    email: str | None,
    exclude_id: int | None = None,
) -> None:
    """Levanta 400 com aviso claro se CPF ou e-mail ja pertencem a outro aluno."""
    if cpf:
        stmt = select(Student.id).where(Student.cpf == cpf)
        if exclude_id is not None:
            stmt = stmt.where(Student.id != exclude_id)
        if db.scalar(stmt) is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Ja existe um aluno cadastrado com o CPF {cpf}.",
            )
    if email:
        stmt = select(Student.id).where(func.lower(Student.email) == email.lower())
        if exclude_id is not None:
            stmt = stmt.where(Student.id != exclude_id)
        if db.scalar(stmt) is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Ja existe um aluno cadastrado com o e-mail {email}.",
            )
