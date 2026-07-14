from datetime import date, datetime, time

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.sale import Sale, SaleItem
from app.models.user import User
from app.schemas.sale import SaleCreate, SaleRead
from app.services.sales import create_sale_with_stock

router = APIRouter(prefix="/sales", tags=["sales"])


@router.get("", response_model=list[SaleRead])
def list_sales(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> list[Sale]:
    stmt = (
        select(Sale)
        .options(selectinload(Sale.items).selectinload(SaleItem.product), selectinload(Sale.created_by))
        .order_by(Sale.created_at.desc())
    )
    if start_date:
        stmt = stmt.where(Sale.created_at >= datetime.combine(start_date, time.min))
    if end_date:
        stmt = stmt.where(Sale.created_at <= datetime.combine(end_date, time.max))
    return list(db.scalars(stmt).all())


@router.post("", response_model=SaleRead, status_code=status.HTTP_201_CREATED)
def create_sale(
    payload: SaleCreate,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> Sale:
    return create_sale_with_stock(db, payload, current_user)
