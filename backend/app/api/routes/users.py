from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user
from app.core.security import get_password_hash
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.common import APIMessage
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services.audit import model_snapshot, record_audit
from app.services.users import create_user

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserRead])
def list_users(_: User = Depends(get_admin_user), db: Session = Depends(get_db)) -> list[User]:
    return list(db.scalars(select(User).order_by(User.name)).all())


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_system_user(
    payload: UserCreate,
    current_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> User:
    existing = db.scalar(select(User).where(func.lower(User.email) == str(payload.email).lower()))
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ja existe usuario com este e-mail.")
    user = create_user(db, payload)
    record_audit(
        db,
        current_user,
        entity_type="USER",
        entity_id=user.id,
        action="CREATE",
        summary=f"Usuario criado: {user.email}.",
        after=model_snapshot(user),
    )
    db.commit()
    return user


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    payload: UserUpdate,
    current_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado.")
    before = model_snapshot(user)

    update_data = payload.model_dump(exclude_unset=True)

    # Impede que a academia fique sem administrador ativo (auto-rebaixamento/desativacao do ultimo admin).
    demoting_role = update_data.get("role") is not None and update_data["role"] != UserRole.ADMIN
    deactivating = update_data.get("is_active") is False
    if user.role == UserRole.ADMIN and user.is_active and (demoting_role or deactivating):
        other_active_admins = db.scalar(
            select(func.count(User.id)).where(
                User.role == UserRole.ADMIN,
                User.is_active.is_(True),
                User.id != user_id,
            )
        )
        if not other_active_admins:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nao e possivel remover o ultimo administrador ativo.",
            )

    if "email" in update_data and update_data["email"] is not None:
        existing = db.scalar(
            select(User).where(func.lower(User.email) == str(update_data["email"]).lower(), User.id != user_id)
        )
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ja existe usuario com este e-mail.")
        user.email = str(update_data.pop("email")).lower()

    password = update_data.pop("password", None)
    if password:
        user.hashed_password = get_password_hash(password)
    for field, value in update_data.items():
        setattr(user, field, value)
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="USER",
        entity_id=user.id,
        action="UPDATE",
        summary=f"Usuario atualizado: {user.email}.",
        before=before,
        after=model_snapshot(user),
    )
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", response_model=APIMessage)
def deactivate_user(
    user_id: int,
    current_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> APIMessage:
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nao e possivel desativar seu proprio usuario.")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado.")
    before = model_snapshot(user)
    user.is_active = False
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="USER",
        entity_id=user.id,
        action="DEACTIVATE",
        summary=f"Usuario desativado: {user.email}.",
        before=before,
        after=model_snapshot(user),
    )
    db.commit()
    return APIMessage(message="Usuario desativado.")
