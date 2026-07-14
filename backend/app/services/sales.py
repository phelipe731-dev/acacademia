from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.enums import ProductStatus, StockMovementType
from app.models.product import Product
from app.models.sale import Sale, SaleItem
from app.models.stock import StockMovement
from app.models.user import User
from app.schemas.sale import SaleCreate
from app.services.audit import model_snapshot, record_audit


def create_sale_with_stock(db: Session, payload: SaleCreate, current_user: User) -> Sale:
    product_ids = [item.product_id for item in payload.items]
    # with_for_update() serializa a baixa de estoque: duas vendas simultaneas do mesmo
    # produto nao conseguem ler o saldo ao mesmo tempo, evitando venda a descoberto.
    # (Em SQLite, usado nos testes, o lock e um no-op silencioso.)
    products = {
        product.id: product
        for product in db.scalars(
            select(Product).where(Product.id.in_(product_ids)).with_for_update()
        ).all()
    }

    total_by_product: dict[int, int] = {}
    for item in payload.items:
        total_by_product[item.product_id] = total_by_product.get(item.product_id, 0) + item.quantity

    for product_id, requested_qty in total_by_product.items():
        product = products.get(product_id)
        if product is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto nao encontrado.")
        if product.status != ProductStatus.ATIVO:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Produto inativo: {product.name}.")
        if product.stock_quantity < requested_qty:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Estoque insuficiente para {product.name}. Disponivel: {product.stock_quantity}.",
            )

    sale = Sale(payment_method=payload.payment_method, notes=payload.notes, created_by_id=current_user.id, total_amount=0)
    db.add(sale)
    db.flush()

    total = Decimal("0.00")
    for item in payload.items:
        product = products[item.product_id]
        unit_price = product.sale_price
        subtotal = (unit_price * item.quantity).quantize(Decimal("0.01"))
        product.stock_quantity -= item.quantity
        total += subtotal

        db.add(
            SaleItem(
                sale_id=sale.id,
                product_id=product.id,
                quantity=item.quantity,
                unit_price=unit_price,
                subtotal=subtotal,
            )
        )
        db.add(
            StockMovement(
                product_id=product.id,
                type=StockMovementType.SAIDA_VENDA,
                quantity=item.quantity,
                reason=f"Venda #{sale.id}",
                created_by_id=current_user.id,
            )
        )

    sale.total_amount = total.quantize(Decimal("0.01"))
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="SALE",
        entity_id=sale.id,
        action="CREATE",
        summary=f"Venda registrada #{sale.id} no valor de {sale.total_amount}.",
        after=model_snapshot(sale),
    )
    db.commit()
    return db.scalars(
        select(Sale)
        .where(Sale.id == sale.id)
        .options(
            selectinload(Sale.items).selectinload(SaleItem.product),
            selectinload(Sale.created_by),
        )
    ).one()
