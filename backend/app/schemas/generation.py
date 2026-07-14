from datetime import date

from pydantic import BaseModel, Field


class MonthlyPaymentsGenerateRequest(BaseModel):
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)


class MonthlyPaymentsGenerateResult(BaseModel):
    year: int
    month: int
    generated: int
    skipped_existing: int
    due_dates: list[date]
