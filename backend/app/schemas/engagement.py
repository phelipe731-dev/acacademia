from datetime import date

from pydantic import BaseModel


class InactiveStudentRow(BaseModel):
    """Aluno ativo que nao faz check-in ha muitos dias (risco de cancelamento)."""

    student_id: int
    name: str
    phone: str
    last_checkin: date | None = None
    days_since: int | None = None


class ExpiringPlanRow(BaseModel):
    """Aluno cujo plano vence em breve (ou ja venceu)."""

    student_id: int
    name: str
    phone: str
    plan: str
    plan_end_date: date
    days_left: int


class BirthdayRow(BaseModel):
    student_id: int
    name: str
    phone: str
    birth_date: date
    day: int
