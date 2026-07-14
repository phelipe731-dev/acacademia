import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.auth import InitialAdminCreate, LoginRequest, TokenResponse
from app.schemas.common import APIMessage
from app.schemas.user import UserRead
from app.services.users import create_user, has_any_user
from app.api.deps import clear_auth_cookie, get_current_user, set_auth_cookie

router = APIRouter(prefix="/auth", tags=["auth"])

# Rate limiting simples em memoria por (IP + e-mail). Suficiente para o MVP; para
# multiplos workers/instancias, migrar para um backend compartilhado (ex.: Redis).
LOGIN_MAX_ATTEMPTS = 5
LOGIN_WINDOW_SECONDS = 300
_login_attempts: dict[str, deque[float]] = defaultdict(deque)


def _login_rate_limit_key(request: Request, email: str) -> str:
    client_ip = request.client.host if request.client else "unknown"
    return f"{client_ip}:{email.strip().lower()}"


def _enforce_login_rate_limit(key: str) -> None:
    now = time.monotonic()
    attempts = _login_attempts[key]
    while attempts and now - attempts[0] > LOGIN_WINDOW_SECONDS:
        attempts.popleft()
    if len(attempts) >= LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Muitas tentativas de login. Aguarde alguns minutos e tente novamente.",
            headers={"Retry-After": str(LOGIN_WINDOW_SECONDS)},
        )


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> TokenResponse:
    key = _login_rate_limit_key(request, str(payload.email))
    _enforce_login_rate_limit(key)
    user = db.scalar(select(User).where(func.lower(User.email) == str(payload.email).lower()))
    if user is None or not user.is_active or not verify_password(payload.password, user.hashed_password):
        _login_attempts[key].append(time.monotonic())
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="E-mail ou senha invalidos.")
    _login_attempts.pop(key, None)
    token = create_access_token(str(user.id))
    # Cookie httpOnly: o token nao fica acessivel a JavaScript (mitiga roubo por XSS).
    set_auth_cookie(response, token)
    return TokenResponse(access_token=token, user=user)


@router.post("/logout", response_model=APIMessage)
def logout(response: Response) -> APIMessage:
    clear_auth_cookie(response)
    return APIMessage(message="Sessao encerrada.")


@router.post("/register-admin", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register_initial_admin(payload: InitialAdminCreate, db: Session = Depends(get_db)) -> User:
    if has_any_user(db):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="O administrador inicial ja foi criado.")
    payload.role = UserRole.ADMIN
    payload.is_active = True
    return create_user(db, payload)


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
