from datetime import datetime

from pydantic import BaseModel, ConfigDict


class APIMessage(BaseModel):
    message: str


class TimestampMixin(BaseModel):
    created_at: datetime
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
