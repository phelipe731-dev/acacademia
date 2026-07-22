from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import settings
from tests.conftest import create_admin_and_headers, create_student


def _create_user_and_login(client: TestClient, admin_headers: dict[str, str], role: str) -> dict[str, str]:
    email = f"{role.lower()}@example.com"
    created = client.post(
        "/users",
        headers=admin_headers,
        json={
            "name": role.title(),
            "email": email,
            "password": "senha123",
            "role": role,
            "is_active": True,
        },
    )
    assert created.status_code == 201, created.text
    login = client.post("/auth/login", json={"email": email, "password": "senha123"})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _create_training_plan(client: TestClient, headers: dict[str, str], student_id: int) -> dict:
    response = client.post(
        f"/students/{student_id}/training-plans",
        headers=headers,
        json={
            "name": "Ficha A",
            "objective": "Hipertrofia",
            "start_date": "2026-07-14",
            "reassessment_date": "2026-08-14",
            "notes": "Treino inicial",
            "is_active": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_exercise(client: TestClient, headers: dict[str, str], plan_id: int) -> dict:
    response = client.post(
        f"/training-plans/{plan_id}/exercises",
        headers=headers,
        json={
            "name": "Supino reto",
            "muscle_group": "Peito",
            "sets": "4",
            "repetitions": "10",
            "load": "30kg",
            "rest": "60s",
            "notes": "Controlar a descida",
            "sort_order": 1,
            "is_active": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_training_plan_public_link_media_and_revoke(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    student = create_student(client, headers)
    plan = _create_training_plan(client, headers, student["id"])
    exercise = _create_exercise(client, headers, plan["id"])

    media = client.post(
        f"/training-plan-exercises/{exercise['id']}/media",
        headers=headers,
        data={
            "media_type": "EXTERNAL_VIDEO",
            "external_url": "https://www.youtube.com/watch?v=demo",
            "title": "Video demonstrativo",
            "description": "Execucao do movimento",
            "sort_order": "1",
        },
    )
    assert media.status_code == 201, media.text

    link = client.post(f"/training-plans/{plan['id']}/share-link", headers=headers, json={})
    assert link.status_code == 200, link.text
    token = link.json()["token"]
    assert token not in str(plan["id"])
    assert len(token) == 12
    assert f"/t/{token}" in link.json()["public_url"]

    public = client.get(f"/public/training-plans/{token}")
    assert public.status_code == 200, public.text
    body = public.json()
    assert body["student_name"] == student["name"]
    assert body["plan_name"] == "Ficha A"
    assert body["exercises"][0]["name"] == "Supino reto"
    assert body["exercises"][0]["media"][0]["external_url"].startswith("https://www.youtube.com")
    assert "monthly_fee" not in public.text
    assert "payments" not in public.text
    assert "stock" not in public.text

    revoked = client.post(f"/training-plans/{plan['id']}/share-link/revoke", headers=headers)
    assert revoked.status_code == 200
    assert client.get(f"/public/training-plans/{token}").status_code == 404


def test_professor_can_manage_training_but_not_sensitive_modules(client: TestClient) -> None:
    admin_headers = create_admin_and_headers(client)
    professor_headers = _create_user_and_login(client, admin_headers, "PROFESSOR")
    student = create_student(client, admin_headers)

    plan = _create_training_plan(client, professor_headers, student["id"])
    exercise = _create_exercise(client, professor_headers, plan["id"])
    assert exercise["name"] == "Supino reto"

    assert client.get("/payments", headers=professor_headers).status_code == 403
    assert client.get("/products", headers=professor_headers).status_code == 403
    assert client.get("/stock-movements", headers=professor_headers).status_code == 403
    assert client.get("/sales", headers=professor_headers).status_code == 403
    assert client.get("/reports/revenue", headers=professor_headers).status_code == 403
    assert client.get("/dashboard", headers=professor_headers).status_code == 403
    assert client.get("/users", headers=professor_headers).status_code == 403


def test_reception_can_view_training_but_cannot_edit_or_share(client: TestClient) -> None:
    admin_headers = create_admin_and_headers(client)
    reception_headers = _create_user_and_login(client, admin_headers, "RECEPCAO")
    student = create_student(client, admin_headers)
    plan = _create_training_plan(client, admin_headers, student["id"])

    plans = client.get(f"/students/{student['id']}/training-plans", headers=reception_headers)
    assert plans.status_code == 200
    assert plans.json()[0]["id"] == plan["id"]

    denied = client.post(
        f"/training-plans/{plan['id']}/exercises",
        headers=reception_headers,
        json={"name": "Agachamento", "sort_order": 1, "is_active": True},
    )
    assert denied.status_code == 403
    assert client.post(f"/training-plans/{plan['id']}/share-link", headers=reception_headers, json={}).status_code == 403


def test_checkins_are_restricted_to_admin_and_reception(client: TestClient) -> None:
    admin_headers = create_admin_and_headers(client)
    professor_headers = _create_user_and_login(client, admin_headers, "PROFESSOR")
    student = create_student(client, admin_headers)

    assert client.post(
        "/checkins", headers=professor_headers, json={"student_id": student["id"]}
    ).status_code == 403
    assert client.get("/checkins/today", headers=professor_headers).status_code == 403
    assert client.get("/checkins", headers=professor_headers).status_code == 403

    # Recepcao continua liberada para registrar frequencia.
    reception_headers = _create_user_and_login(client, admin_headers, "RECEPCAO")
    ok = client.post("/checkins", headers=reception_headers, json={"student_id": student["id"]})
    assert ok.status_code == 201, ok.text


def test_media_thumbnail_url_must_use_http_scheme(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    student = create_student(client, headers)
    plan = _create_training_plan(client, headers, student["id"])
    exercise = _create_exercise(client, headers, plan["id"])

    rejected = client.post(
        f"/training-plan-exercises/{exercise['id']}/media",
        headers=headers,
        data={
            "media_type": "EXTERNAL_VIDEO",
            "external_url": "https://www.youtube.com/watch?v=demo",
            "thumbnail_url": "javascript:alert(1)",
        },
    )
    assert rejected.status_code == 422

    accepted = client.post(
        f"/training-plan-exercises/{exercise['id']}/media",
        headers=headers,
        data={
            "media_type": "EXTERNAL_VIDEO",
            "external_url": "https://www.youtube.com/watch?v=demo",
            "thumbnail_url": "https://img.example.com/thumb.jpg",
        },
    )
    assert accepted.status_code == 201, accepted.text
    assert accepted.json()["thumbnail_url"] == "https://img.example.com/thumb.jpg"


def test_switching_media_from_upload_to_external_removes_old_file(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    student = create_student(client, headers)
    plan = _create_training_plan(client, headers, student["id"])
    exercise = _create_exercise(client, headers, plan["id"])

    uploaded = client.post(
        f"/training-plan-exercises/{exercise['id']}/media",
        headers=headers,
        data={"media_type": "IMAGE", "sort_order": "0"},
        files={"file": ("foto.png", b"fake-png-bytes", "image/png")},
    )
    assert uploaded.status_code == 201, uploaded.text
    media = uploaded.json()
    file_url = media["file_url"]
    assert file_url.startswith("/uploads/training-media/")
    stored_path = Path(settings.upload_dir) / file_url.removeprefix("/uploads/")
    assert stored_path.exists()

    switched = client.patch(
        f"/training-plan-exercise-media/{media['id']}",
        headers=headers,
        json={"media_type": "EXTERNAL_IMAGE", "external_url": "https://img.example.com/foto.jpg"},
    )
    assert switched.status_code == 200, switched.text
    assert switched.json()["file_url"] is None
    assert not stored_path.exists()
