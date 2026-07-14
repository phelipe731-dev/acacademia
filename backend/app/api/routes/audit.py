from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_admin_user
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.user import User
from app.schemas.audit import AuditLogRead

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get("", response_model=list[AuditLogRead])
def list_audit_logs(
    entity_type: str | None = Query(default=None),
    action: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> list[AuditLog]:
    stmt = (
        select(AuditLog)
        .options(selectinload(AuditLog.created_by))
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
    )
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type.upper())
    if action:
        stmt = stmt.where(AuditLog.action == action.upper())
    return list(db.scalars(stmt).all())
