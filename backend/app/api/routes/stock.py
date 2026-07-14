from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.enums import StockMovementType, UserRole
from app.models.product import Product
from app.models.stock import StockMovement
from app.models.user import User
from app.schemas.stock import StockMovementCreate, StockMovementRead
from app.services.audit import model_snapshot, record_audit

router = APIRouter(prefix="/stock-movements", tags=["stock"])


@router.get("", response_model=list[StockMovementRead])
def list_stock_movements(
    product_id: int | None = Query(default=None),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> list[StockMovement]:
    stmt = (
        select(StockMovement)
        .options(selectinload(StockMovement.product), selectinload(StockMovement.created_by))
        .order_by(StockMovement.created_at.desc())
    )
    if product_id:
        stmt = stmt.where(StockMovement.product_id == product_id)
    return list(db.scalars(stmt).all())


@router.post("", response_model=StockMovementRead, status_code=status.HTTP_201_CREATED)
def create_stock_movement(
    payload: StockMovementCreate,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> StockMovement:
    # Lock da linha para que ajustes/entradas concorrentes nao gerem estoque negativo.
    product = db.get(Product, payload.product_id, with_for_update=True)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto nao encontrado.")

    if payload.type == StockMovementType.ENTRADA:
        product.stock_quantity += payload.quantity
    elif payload.type == StockMovementType.AJUSTE:
        new_quantity = product.stock_quantity + payload.quantity
        if new_quantity < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ajuste deixaria estoque negativo.")
        product.stock_quantity = new_quantity

    movement = StockMovement(
        product_id=product.id,
        type=payload.type,
        quantity=payload.quantity,
        reason=payload.reason,
        created_by_id=current_user.id,
    )
    db.add(movement)
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="STOCK_MOVEMENT",
        entity_id=movement.id,
        action=payload.type.value,
        summary=f"Movimentacao de estoque em {product.name}: {payload.type.value} {payload.quantity}.",
        after={"movement": model_snapshot(movement), "product": model_snapshot(product)},
    )
    db.commit()
    return db.scalars(
        select(StockMovement)
        .where(StockMovement.id == movement.id)
        .options(selectinload(StockMovement.product), selectinload(StockMovement.created_by))
    ).one()
