import os
from collections.abc import Generator

os.environ["AUTO_CREATE_ADMIN"] = "false"
os.environ["DATABASE_URL"] = "sqlite+pysqlite:///./test_ac_academia.db"
os.environ["SECRET_KEY"] = "test-secret"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app import models  # noqa: F401
from app.db.base import Base
from app.db.session import get_db
from app.main import app


engine = create_engine(os.environ["DATABASE_URL"], connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def override_get_db() -> Generator[Session, None, None]:
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def reset_database() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def create_admin_and_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/auth/register-admin",
        json={
            "name": "Admin",
            "email": "admin@example.com",
            "password": "admin123",
            "role": "ADMIN",
            "is_active": True,
        },
    )
    assert response.status_code == 201, response.text
    login = client.post("/auth/login", json={"email": "admin@example.com", "password": "admin123"})
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def create_student(client: TestClient, headers: dict[str, str]) -> dict:
    response = client.post(
        "/students",
        headers=headers,
        json={
            "name": "Maria Silva",
            "phone": "11999990000",
            "email": "maria@example.com",
            "cpf": None,
            "birth_date": None,
            "plan": "Mensal",
            "monthly_fee": 120,
            "due_day": 10,
            "status": "ATIVO",
            "notes": None,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_product(client: TestClient, headers: dict[str, str], stock: int = 0) -> dict:
    response = client.post(
        "/products",
        headers=headers,
        json={
            "name": "Whey Protein",
            "category": "Suplemento",
            "cost_price": 80,
            "sale_price": 120,
            "stock_quantity": stock,
            "min_stock": 2,
            "status": "ATIVO",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


import pytest


@pytest.fixture(autouse=True)
def database() -> Generator[None, None, None]:
    reset_database()
    yield
    reset_database()


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
