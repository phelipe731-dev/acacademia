from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.enums import StudentStatus


class StudentBase(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    phone: str = Field(min_length=3, max_length=40)
    email: EmailStr | None = None
    cpf: str | None = Field(default=None, max_length=20)
    birth_date: date | None = None
    plan: str = Field(min_length=2, max_length=120)
    plan_end_date: date | None = None
    monthly_fee: Decimal = Field(ge=0)
    due_day: int = Field(ge=1, le=31)
    status: StudentStatus = StudentStatus.ATIVO
    notes: str | None = None

    @field_validator("monthly_fee")
    @classmethod
    def money_scale(cls, value: Decimal) -> Decimal:
        return value.quantize(Decimal("0.01"))


class StudentCreate(StudentBase):
    pass


class StudentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    phone: str | None = Field(default=None, min_length=3, max_length=40)
    email: EmailStr | None = None
    cpf: str | None = Field(default=None, max_length=20)
    birth_date: date | None = None
    plan: str | None = Field(default=None, min_length=2, max_length=120)
    plan_end_date: date | None = None
    monthly_fee: Decimal | None = Field(default=None, ge=0)
    due_day: int | None = Field(default=None, ge=1, le=31)
    status: StudentStatus | None = None
    notes: str | None = None


class StudentRead(StudentBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
