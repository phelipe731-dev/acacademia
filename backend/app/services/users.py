from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.user import UserCreate


def create_user(db: Session, payload: UserCreate) -> User:
    user = User(
        name=payload.name,
        email=str(payload.email).lower(),
        hashed_password=get_password_hash(payload.password),
        role=payload.role,
        is_active=payload.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def has_any_user(db: Session) -> bool:
    return db.scalar(select(User.id).limit(1)) is not None


def has_admin(db: Session) -> bool:
    return db.scalar(select(User.id).where(User.role == UserRole.ADMIN).limit(1)) is not None
