from datetime import date
from decimal import Decimal

from fastapi import HTTPException, status

from app.models.enums import PaymentMethod, PaymentStatus, SaleInstallmentStatus
from app.models.payment import Payment
from app.models.receipt import FinancialReceipt
from app.models.sale import SaleInstallment
from app.models.user import User
from app.schemas.payment import FinancialReceiptCreate


def money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


def add_payment_receipt(
    payment: Payment,
    payload: FinancialReceiptCreate,
    current_user: User,
) -> FinancialReceipt:
    if payment.status == PaymentStatus.CANCELADO:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mensalidade cancelada não pode receber pagamento.")
    amount = money(payload.amount)
    balance = payment.balance_due
    if amount > balance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"O recebimento não pode superar o saldo em aberto de R$ {balance:.2f}.",
        )
    receipt = FinancialReceipt(
        amount=amount,
        paid_at=payload.paid_at or date.today(),
        payment_method=payload.payment_method,
        notes=payload.notes,
        created_by_id=current_user.id,
    )
    payment.receipts.append(receipt)
    payment.payment_method = payload.payment_method
    payment.paid_at = receipt.paid_at
    total = payment.total_paid
    payment.status = PaymentStatus.PAGO if total >= payment.amount else PaymentStatus.PARCIAL
    return receipt


def add_sale_installment_receipt(
    installment: SaleInstallment,
    payload: FinancialReceiptCreate,
    current_user: User,
) -> FinancialReceipt:
    if installment.status == SaleInstallmentStatus.CANCELADA:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Parcela cancelada não pode receber pagamento.")
    amount = money(payload.amount)
    balance = installment.balance_due
    if amount > balance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"O recebimento não pode superar o saldo em aberto de R$ {balance:.2f}.",
        )
    receipt = FinancialReceipt(
        amount=amount,
        paid_at=payload.paid_at or date.today(),
        payment_method=payload.payment_method,
        notes=payload.notes,
        created_by_id=current_user.id,
    )
    installment.receipts.append(receipt)
    installment.payment_method = payload.payment_method
    installment.paid_at = receipt.paid_at
    total = installment.total_paid
    installment.status = SaleInstallmentStatus.PAGA if total >= installment.amount else SaleInstallmentStatus.PARCIAL
    return receipt
