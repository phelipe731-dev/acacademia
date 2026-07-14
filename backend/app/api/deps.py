from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.user import User


def extract_token(request: Request) -> str | None:
    """Token via header Authorization (clientes de API) ou cookie httpOnly (navegador)."""
    authorization = request.headers.get("Authorization")
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return request.cookies.get(settings.auth_cookie_name)


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=settings.auth_cookie_name, path="/", samesite="lax")


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = extract_token(request)
    subject = decode_access_token(token) if token else None
    if subject is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalido ou expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.get(User, int(subject)) if subject.isdigit() else None
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario nao autenticado.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_roles(*roles: UserRole) -> Callable[[User], User]:
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado para este perfil.")
        return current_user

    return dependency


def get_admin_user(current_user: User = Depends(require_roles(UserRole.ADMIN))) -> User:
    return current_user
