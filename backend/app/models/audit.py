from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    entity_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    entity_id: Mapped[int | None] = mapped_column(index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    before_data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    after_data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    created_by = relationship("User")
