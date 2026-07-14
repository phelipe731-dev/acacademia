from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.schemas.user import UserRead


class AuditLogRead(BaseModel):
    id: int
    entity_type: str
    entity_id: int | None
    action: str
    summary: str
    before_data: dict[str, Any] | None
    after_data: dict[str, Any] | None
    created_by_id: int | None
    created_at: datetime
    created_by: UserRead | None = None

    model_config = ConfigDict(from_attributes=True)
