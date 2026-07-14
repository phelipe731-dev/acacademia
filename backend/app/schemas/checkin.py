from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.student import StudentRead


class CheckInCreate(BaseModel):
    student_id: int


class CheckInRead(BaseModel):
    id: int
    student_id: int
    checked_in_at: datetime
    created_by_id: int | None = None
    student: StudentRead | None = None

    model_config = ConfigDict(from_attributes=True)
