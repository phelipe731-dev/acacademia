from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.user import User

HIDDEN_FIELDS = {"hashed_password"}


def json_safe(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Decimal):
        return str(value.quantize(Decimal("0.01")))
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


def model_snapshot(model: Any) -> dict[str, Any]:
    mapper = inspect(model.__class__)
    snapshot: dict[str, Any] = {}
    for column in mapper.columns:
        key = column.key
        if key in HIDDEN_FIELDS:
            continue
        snapshot[key] = json_safe(getattr(model, key))
    return snapshot


def record_audit(
    db: Session,
    current_user: User | None,
    *,
    entity_type: str,
    action: str,
    summary: str,
    entity_id: int | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> AuditLog:
    log = AuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        summary=summary,
        before_data=before,
        after_data=after,
        created_by_id=current_user.id if current_user else None,
    )
    db.add(log)
    return log
