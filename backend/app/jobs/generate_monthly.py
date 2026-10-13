from sqlalchemy import select

from app.core.tz import business_today
from app.db.session import SessionLocal
from app.models.enums import UserRole
from app.models.user import User
from app.services.payments import generate_monthly_payments
from app.services.sales import add_months


def main() -> None:
    today = business_today()
    next_month = add_months(today, 1)
    with SessionLocal() as db:
        operator = db.scalar(
            select(User)
            .where(User.role == UserRole.ADMIN, User.is_active.is_(True))
            .order_by(User.id)
        )
        if operator is None:
            raise RuntimeError("Nenhum administrador ativo disponivel para a geracao automatica.")
        for reference in (today, next_month):
            generated, skipped, _ = generate_monthly_payments(db, operator, reference.year, reference.month)
            print(f"{reference.year:04d}-{reference.month:02d}: generated={generated} skipped={skipped}")


if __name__ == "__main__":
    main()
