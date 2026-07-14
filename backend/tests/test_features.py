from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.tz import business_today
from app.models.checkin import CheckIn
from tests.conftest import TestingSessionLocal, create_admin_and_headers, create_student


def _student_payload(**overrides) -> dict:
    base = {
        "name": "Aluno Teste",
        "phone": "11900000000",
        "email": None,
        "cpf": None,
        "birth_date": None,
        "plan": "Mensal",
        "plan_end_date": None,
        "monthly_fee": 100,
        "due_day": 10,
        "status": "ATIVO",
        "notes": None,
    }
    base.update(overrides)
    return base


def test_duplicate_cpf_is_blocked_with_message(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    first = client.post("/students", headers=headers, json=_student_payload(name="Ana", cpf="12345678900"))
    assert first.status_code == 201, first.text
    second = client.post("/students", headers=headers, json=_student_payload(name="Outra Ana", cpf="12345678900"))
    assert second.status_code == 400
    assert "CPF" in second.json()["detail"]


def test_duplicate_email_is_blocked(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    client.post("/students", headers=headers, json=_student_payload(name="Bia", email="bia@example.com"))
    dup = client.post("/students", headers=headers, json=_student_payload(name="Bia 2", email="BIA@example.com"))
    assert dup.status_code == 400
    assert "e-mail" in dup.json()["detail"].lower()


def test_checkin_registers_and_appears_today(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    student = create_student(client, headers)

    response = client.post("/checkins", headers=headers, json={"student_id": student["id"]})
    assert response.status_code == 201, response.text
    assert response.json()["student"]["id"] == student["id"]

    today = client.get("/checkins/today", headers=headers)
    assert today.status_code == 200
    assert len(today.json()) == 1


def test_inactive_students_detects_long_absence(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    student = create_student(client, headers)

    # Aluno que veio hoje nao aparece como inativo.
    client.post("/checkins", headers=headers, json={"student_id": student["id"]})
    assert client.get("/students/inactive?days=15", headers=headers).json() == []

    # Insere um check-in de 20 dias atras diretamente e remove o de hoje.
    with TestingSessionLocal() as db:
        db.query(CheckIn).delete()
        db.add(
            CheckIn(
                student_id=student["id"],
                checked_in_at=datetime.now(timezone.utc) - timedelta(days=20),
            )
        )
        db.commit()

    inactive = client.get("/students/inactive?days=15", headers=headers)
    assert inactive.status_code == 200
    body = inactive.json()
    assert len(body) == 1
    assert body[0]["student_id"] == student["id"]
    assert body[0]["days_since"] >= 15


def test_expiring_plans_lists_soon_to_end(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    soon = (business_today() + timedelta(days=5)).isoformat()
    far = (business_today() + timedelta(days=90)).isoformat()
    client.post("/students", headers=headers, json=_student_payload(name="Vence Logo", plan_end_date=soon))
    client.post("/students", headers=headers, json=_student_payload(name="Vence Longe", plan_end_date=far))

    rows = client.get("/students/expiring-plans?days=15", headers=headers)
    assert rows.status_code == 200
    names = [row["name"] for row in rows.json()]
    assert names == ["Vence Logo"]
    assert rows.json()[0]["days_left"] == 5


def test_birthdays_of_month(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    month = business_today().month
    client.post("/students", headers=headers, json=_student_payload(name="Aniversariante", birth_date=f"1990-{month:02d}-15"))
    other_month = 1 if month != 1 else 2
    client.post("/students", headers=headers, json=_student_payload(name="Outro Mes", birth_date=f"1990-{other_month:02d}-10"))

    rows = client.get("/students/birthdays", headers=headers)
    assert rows.status_code == 200
    names = [row["name"] for row in rows.json()]
    assert names == ["Aniversariante"]


def test_login_sets_httponly_cookie_and_authenticates(client: TestClient) -> None:
    create_admin_and_headers(client)
    login = client.post("/auth/login", json={"email": "admin@example.com", "password": "admin123"})
    assert login.status_code == 200
    assert settings.auth_cookie_name in login.cookies
    # /auth/me funciona apenas pelo cookie, sem header Authorization.
    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "admin@example.com"

    logout = client.post("/auth/logout")
    assert logout.status_code == 200
