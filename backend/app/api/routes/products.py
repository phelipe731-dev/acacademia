from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.enums import ProductStatus, UserRole
from app.models.product import Product
from app.models.user import User
from app.schemas.common import APIMessage
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate
from app.services.audit import model_snapshot, record_audit

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=list[ProductRead])
def list_products(
    search: str | None = Query(default=None),
    status_filter: ProductStatus | None = Query(default=None, alias="status"),
    available_for_sale: bool = False,
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> list[Product]:
    stmt = select(Product).order_by(Product.name)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(or_(Product.name.ilike(like), Product.category.ilike(like)))
    if status_filter:
        stmt = stmt.where(Product.status == status_filter)
    if available_for_sale:
        stmt = stmt.where(Product.status == ProductStatus.ATIVO, Product.stock_quantity > 0)
    return list(db.scalars(stmt).all())


@router.post("", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductCreate,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> Product:
    product = Product(**payload.model_dump())
    db.add(product)
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="PRODUCT",
        entity_id=product.id,
        action="CREATE",
        summary=f"Produto cadastrado: {product.name}.",
        after=model_snapshot(product),
    )
    db.commit()
    db.refresh(product)
    return product


@router.get("/{product_id}", response_model=ProductRead)
def get_product(
    product_id: int,
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RECEPCAO)),
    db: Session = Depends(get_db),
) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto nao encontrado.")
    return product


@router.patch("/{product_id}", response_model=ProductRead)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto nao encontrado.")
    before = model_snapshot(product)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="PRODUCT",
        entity_id=product.id,
        action="UPDATE",
        summary=f"Produto atualizado: {product.name}.",
        before=before,
        after=model_snapshot(product),
    )
    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}", response_model=APIMessage)
def deactivate_product(
    product_id: int,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> APIMessage:
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto nao encontrado.")
    before = model_snapshot(product)
    product.status = ProductStatus.INATIVO
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="PRODUCT",
        entity_id=product.id,
        action="DEACTIVATE",
        summary=f"Produto inativado: {product.name}.",
        before=before,
        after=model_snapshot(product),
    )
    db.commit()
    return APIMessage(message="Produto inativado.")
