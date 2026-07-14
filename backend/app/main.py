from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select

from app.api.routes import (
    audit,
    auth,
    checkins,
    dashboard,
    payments,
    products,
    reports,
    sales,
    stock,
    students,
    training,
    users,
)
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.user import UserCreate
from app.services.users import create_user, has_admin

def seed_initial_admin() -> None:
    if not settings.auto_create_admin:
        return
    with SessionLocal() as db:
        if has_admin(db):
            return
        existing = db.scalar(select(User).where(func.lower(User.email) == settings.first_admin_email.lower()))
        if existing:
            existing.role = UserRole.ADMIN
            existing.is_active = True
            db.commit()
            return
        create_user(
            db,
            UserCreate(
                name=settings.first_admin_name,
                email=settings.first_admin_email,
                password=settings.first_admin_password,
                role=UserRole.ADMIN,
                is_active=True,
            ),
        )


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    seed_initial_admin()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.backend_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name}


app.include_router(auth.router)
app.include_router(audit.router)
app.include_router(users.router)
app.include_router(students.router)
app.include_router(payments.router)
app.include_router(products.router)
app.include_router(stock.router)
app.include_router(sales.router)
app.include_router(checkins.router)
app.include_router(training.router)
app.include_router(dashboard.router)
app.include_router(reports.router)
