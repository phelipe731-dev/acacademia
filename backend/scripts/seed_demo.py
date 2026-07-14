from __future__ import annotations

import sys
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import models  # noqa: F401
from app.core.config import settings
from app.core.tz import business_today
from app.db.session import SessionLocal
from app.models.checkin import CheckIn
from app.models.enums import PaymentMethod, PaymentStatus, ProductStatus, StockMovementType, StudentStatus, UserRole
from app.models.payment import Payment
from app.models.product import Product
from app.models.sale import Sale
from app.models.stock import StockMovement
from app.models.student import Student
from app.models.user import User
from app.schemas.sale import SaleCreate, SaleItemCreate
from app.schemas.user import UserCreate
from app.services.payments import due_date_for_month, normalize_payment_status, refresh_all_student_statuses
from app.services.sales import create_sale_with_stock
from app.services.users import create_user

DEMO_TAG = "DEMO_MOCKUP_VALIDADO"


STUDENTS = [
    ("Ana Costa", "11984561234", "ana.costa.demo@demo.acacademia.com.br", "Plano Mensal", Decimal("129.90"), 5),
    ("Bruno Almeida", "11976784512", "bruno.almeida.demo@demo.acacademia.com.br", "Plano Trimestral", Decimal("119.90"), 10),
    ("Camila Rocha", "11955667788", "camila.rocha.demo@demo.acacademia.com.br", "Plano Mensal", Decimal("139.90"), 12),
    ("Diego Santos", "11933445566", "diego.santos.demo@demo.acacademia.com.br", "Plano Semestral", Decimal("109.90"), 15),
    ("Fernanda Lima", "11999887766", "fernanda.lima.demo@demo.acacademia.com.br", "Plano Mensal", Decimal("129.90"), 18),
    ("Gustavo Martins", "11922223333", "gustavo.martins.demo@demo.acacademia.com.br", "Plano Trimestral", Decimal("119.90"), 20),
    ("Helena Souza", "11911114444", "helena.souza.demo@demo.acacademia.com.br", "Plano Mensal", Decimal("149.90"), 22),
    ("Igor Pereira", "11933334444", "igor.pereira.demo@demo.acacademia.com.br", "Plano Mensal", Decimal("129.90"), 25),
    ("Juliana Nunes", "11955556666", "juliana.nunes.demo@demo.acacademia.com.br", "Plano Semestral", Decimal("109.90"), 8),
    ("Lucas Oliveira", "11977778888", "lucas.oliveira.demo@demo.acacademia.com.br", "Plano Mensal", Decimal("139.90"), 28),
]


PRODUCTS = [
    ("Whey Protein Chocolate 900g", "Suplementos", Decimal("92.00"), Decimal("149.90"), 20, 5),
    ("Creatina Monohidratada 300g", "Suplementos", Decimal("48.00"), Decimal("89.90"), 16, 6),
    ("Pre Treino Nitro 250g", "Suplementos", Decimal("59.00"), Decimal("109.90"), 8, 4),
    ("Barra Proteica Cookies", "Snacks", Decimal("5.50"), Decimal("11.90"), 44, 12),
    ("Coqueteleira AC 600ml", "Acessorios", Decimal("12.00"), Decimal("29.90"), 22, 8),
    ("BCAA Zero Acucar", "Suplementos", Decimal("44.00"), Decimal("79.90"), 4, 5),
    ("Agua Mineral 500ml", "Bebidas", Decimal("1.20"), Decimal("3.50"), 54, 20),
]


def month_shift(year: int, month: int, delta: int) -> tuple[int, int]:
    value = (year * 12 + month - 1) + delta
    return value // 12, value % 12 + 1


def demo_admin(db: Session) -> User:
    admin = db.scalar(select(User).where(User.role == UserRole.ADMIN, User.is_active.is_(True)).order_by(User.id))
    if admin:
        return admin
    return create_user(
        db,
        UserCreate(
            name=settings.first_admin_name,
            email=settings.first_admin_email,
            password=settings.first_admin_password,
            role=UserRole.ADMIN,
            is_active=True,
        ),
    )


def upsert_students(db: Session) -> list[Student]:
    today = business_today()
    result: list[Student] = []
    for index, (name, phone, email, plan, fee, due_day) in enumerate(STUDENTS):
        old_email = email.replace("@demo.acacademia.com.br", "@acacademia.local")
        student = db.scalar(
            select(Student).where(
                or_(
                    func.lower(Student.email) == email.lower(),
                    func.lower(Student.email) == old_email.lower(),
                    (Student.name == name) & (Student.notes.like(f"{DEMO_TAG}%")),
                )
            )
        )
        if student is None:
            student = Student(
                name=name,
                phone=phone,
                email=email,
                cpf=None,
                birth_date=None,
                plan=plan,
                plan_end_date=today + timedelta(days=45 + index * 3),
                monthly_fee=fee,
                due_day=due_day,
                status=StudentStatus.ATIVO,
                notes=f"{DEMO_TAG} - aluno ficticio para validacao operacional.",
            )
            db.add(student)
        else:
            student.name = name
            student.phone = phone
            student.email = email
            student.plan = plan
            student.plan_end_date = student.plan_end_date or (today + timedelta(days=45 + index * 3))
            student.monthly_fee = fee
            student.due_day = due_day
            student.notes = student.notes or f"{DEMO_TAG} - aluno ficticio para validacao operacional."
        result.append(student)
    db.commit()
    return result


def ensure_payment(
    db: Session,
    student: Student,
    *,
    due_date,
    amount: Decimal,
    status: PaymentStatus,
    method: PaymentMethod,
    admin: User,
    note: str,
    paid_at=None,
) -> None:
    exists = db.scalar(
        select(Payment.id).where(
            Payment.student_id == student.id,
            Payment.due_date == due_date,
            Payment.notes == note,
        )
    )
    if exists:
        return
    payment = Payment(
        student_id=student.id,
        amount=amount,
        due_date=due_date,
        paid_at=paid_at,
        status=status,
        payment_method=method,
        notes=note,
        created_by_id=admin.id,
    )
    normalize_payment_status(payment)
    db.add(payment)


def seed_payments(db: Session, students: list[Student], admin: User) -> None:
    today = business_today()
    previous_year, previous_month = month_shift(today.year, today.month, -1)
    next_year, next_month = month_shift(today.year, today.month, 1)
    methods = [PaymentMethod.PIX, PaymentMethod.CARTAO, PaymentMethod.DINHEIRO, PaymentMethod.PIX]

    for index, student in enumerate(students):
        previous_due = due_date_for_month(previous_year, previous_month, student.due_day)
        ensure_payment(
            db,
            student,
            due_date=previous_due,
            amount=student.monthly_fee,
            status=PaymentStatus.PAGO,
            method=methods[index % len(methods)],
            paid_at=previous_due + timedelta(days=1),
            admin=admin,
            note=f"{DEMO_TAG} - mensalidade anterior paga",
        )

        if index in {2, 7}:
            current_due = today - timedelta(days=7 + index)
            ensure_payment(
                db,
                student,
                due_date=current_due,
                amount=student.monthly_fee,
                status=PaymentStatus.PENDENTE,
                method=PaymentMethod.PIX,
                admin=admin,
                note=f"{DEMO_TAG} - mensalidade vencida em aberto",
            )
        elif index in {4, 8}:
            next_due = due_date_for_month(next_year, next_month, student.due_day)
            ensure_payment(
                db,
                student,
                due_date=next_due,
                amount=student.monthly_fee,
                status=PaymentStatus.PENDENTE,
                method=PaymentMethod.PIX,
                admin=admin,
                note=f"{DEMO_TAG} - mensalidade futura pendente",
            )
        else:
            current_due = due_date_for_month(today.year, today.month, student.due_day)
            paid_day = min(today, current_due + timedelta(days=index % 3))
            ensure_payment(
                db,
                student,
                due_date=current_due,
                amount=student.monthly_fee,
                status=PaymentStatus.PAGO,
                method=methods[index % len(methods)],
                paid_at=paid_day,
                admin=admin,
                note=f"{DEMO_TAG} - mensalidade atual paga",
            )

    db.commit()
    refresh_all_student_statuses(db)
    db.commit()


def upsert_products(db: Session, admin: User) -> list[Product]:
    sale_exists = db.scalar(select(Sale.id).where(Sale.notes.like(f"{DEMO_TAG}%")).limit(1)) is not None
    products: list[Product] = []
    for name, category, cost, price, stock, min_stock in PRODUCTS:
        product = db.scalar(select(Product).where(Product.name == name))
        if product is None:
            product = Product(
                name=name,
                category=category,
                cost_price=cost,
                sale_price=price,
                stock_quantity=stock,
                min_stock=min_stock,
                status=ProductStatus.ATIVO,
            )
            db.add(product)
            db.flush()
        else:
            product.category = category
            product.cost_price = cost
            product.sale_price = price
            product.min_stock = min_stock
            product.status = ProductStatus.ATIVO
            if not sale_exists:
                product.stock_quantity = stock

        initial_movement_exists = db.scalar(
            select(StockMovement.id).where(
                StockMovement.product_id == product.id,
                StockMovement.reason == f"{DEMO_TAG} - estoque inicial",
            )
        )
        if initial_movement_exists is None:
            db.add(
                StockMovement(
                    product_id=product.id,
                    type=StockMovementType.ENTRADA,
                    quantity=stock,
                    reason=f"{DEMO_TAG} - estoque inicial",
                    created_by_id=admin.id,
                )
            )
        products.append(product)
    db.commit()
    return products


def seed_sales(db: Session, products: list[Product], admin: User) -> None:
    by_name = {product.name: product for product in products}
    sales = [
        ("venda balcao 1", PaymentMethod.PIX, [("Whey Protein Chocolate 900g", 1), ("Coqueteleira AC 600ml", 1)]),
        ("venda balcao 2", PaymentMethod.CARTAO, [("Creatina Monohidratada 300g", 2), ("Barra Proteica Cookies", 3)]),
        ("venda balcao 3", PaymentMethod.DINHEIRO, [("Agua Mineral 500ml", 6), ("Barra Proteica Cookies", 2)]),
        ("venda balcao 4", PaymentMethod.PIX, [("Pre Treino Nitro 250g", 1), ("BCAA Zero Acucar", 1)]),
        ("venda balcao 5", PaymentMethod.CARTAO, [("Creatina Monohidratada 300g", 1), ("Agua Mineral 500ml", 4)]),
    ]
    for index, (label, method, items) in enumerate(sales):
        note = f"{DEMO_TAG} - {label}"
        if db.scalar(select(Sale.id).where(Sale.notes == note)):
            continue
        sale = create_sale_with_stock(
            db,
            SaleCreate(
                payment_method=method,
                notes=note,
                items=[
                    SaleItemCreate(product_id=by_name[product_name].id, quantity=quantity)
                    for product_name, quantity in items
                ],
            ),
            admin,
        )
        sale.created_at = datetime.combine(
            business_today() - timedelta(days=index * 2),
            time(hour=10 + index, minute=15),
            tzinfo=timezone.utc,
        )
        db.commit()


def seed_checkins(db: Session, students: list[Student], admin: User) -> None:
    today = business_today()
    schedule = [
        (0, [0, 1, 2, 3, 4, 5]),
        (1, [1, 3, 5, 7, 9]),
        (2, [0, 2, 4, 6, 8]),
        (5, [2, 3, 6]),
        (10, [0, 5, 9]),
        (18, [7]),
    ]
    for days_ago, indexes in schedule:
        checkin_day = today - timedelta(days=days_ago)
        for offset, student_index in enumerate(indexes):
            student = students[student_index]
            checkin_at = datetime.combine(
                checkin_day,
                time(hour=6 + (offset % 6), minute=10 + offset),
                tzinfo=timezone.utc,
            )
            day_start = datetime.combine(checkin_day, time.min, tzinfo=timezone.utc)
            day_end = datetime.combine(checkin_day, time.max, tzinfo=timezone.utc)
            exists = db.scalar(
                select(CheckIn.id).where(
                    CheckIn.student_id == student.id,
                    CheckIn.checked_in_at >= day_start,
                    CheckIn.checked_in_at <= day_end,
                )
            )
            if exists is None:
                db.add(CheckIn(student_id=student.id, checked_in_at=checkin_at, created_by_id=admin.id))
    db.commit()


def count_demo(db: Session) -> dict[str, int]:
    demo_student_ids = db.scalars(
        select(Student.id).where(
            or_(
                Student.email.like("%.demo@demo.acacademia.com.br"),
                Student.notes.like(f"{DEMO_TAG}%"),
            )
        )
    ).all()
    return {
        "students": len(demo_student_ids),
        "payments": db.scalar(select(func.count(Payment.id)).where(Payment.notes.like(f"{DEMO_TAG}%"))) or 0,
        "products": db.scalar(select(func.count(Product.id)).where(Product.name.in_([item[0] for item in PRODUCTS]))) or 0,
        "sales": db.scalar(select(func.count(Sale.id)).where(Sale.notes.like(f"{DEMO_TAG}%"))) or 0,
        "checkins": (
            db.scalar(select(func.count(CheckIn.id)).where(CheckIn.student_id.in_(demo_student_ids)))
            if demo_student_ids
            else 0
        )
        or 0,
    }


def main() -> None:
    with SessionLocal() as db:
        admin = demo_admin(db)
        students = upsert_students(db)
        seed_payments(db, students, admin)
        products = upsert_products(db, admin)
        seed_sales(db, products, admin)
        seed_checkins(db, students, admin)
        summary = count_demo(db)

    print("Mockup validado criado/atualizado:")
    print(f"- {summary['students']} alunos ficticios")
    print(f"- {summary['payments']} mensalidades demo")
    print(f"- {summary['products']} produtos demo")
    print(f"- {summary['sales']} vendas demo com baixa de estoque")
    print(f"- {summary['checkins']} registros de frequencia demo")


if __name__ == "__main__":
    main()
