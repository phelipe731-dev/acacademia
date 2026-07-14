from datetime import date, timedelta

from fastapi.testclient import TestClient

from tests.conftest import create_admin_and_headers, create_product, create_student


def test_initial_admin_login_and_me(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    response = client.get("/auth/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["role"] == "ADMIN"


def test_create_student(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    student = create_student(client, headers)
    assert student["name"] == "Maria Silva"

    response = client.get("/students?search=Maria", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_register_payment_and_student_history(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    student = create_student(client, headers)

    response = client.post(
        "/payments",
        headers=headers,
        json={
            "student_id": student["id"],
            "amount": 120,
            "due_date": str(date.today()),
            "paid_at": str(date.today()),
            "status": "PAGO",
            "payment_method": "PIX",
            "notes": "Mensalidade de teste",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "PAGO"

    history = client.get(f"/students/{student['id']}/payments", headers=headers)
    assert history.status_code == 200
    assert len(history.json()) == 1


def test_create_product_and_stock_entry(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    product = create_product(client, headers, stock=0)

    response = client.post(
        "/stock-movements",
        headers=headers,
        json={"product_id": product["id"], "type": "ENTRADA", "quantity": 5, "reason": "Compra inicial"},
    )
    assert response.status_code == 201, response.text

    updated = client.get(f"/products/{product['id']}", headers=headers)
    assert updated.status_code == 200
    assert updated.json()["stock_quantity"] == 5


def test_sale_decrements_stock_and_creates_movement(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    product = create_product(client, headers, stock=5)

    response = client.post(
        "/sales",
        headers=headers,
        json={"payment_method": "DINHEIRO", "notes": None, "items": [{"product_id": product["id"], "quantity": 2}]},
    )
    assert response.status_code == 201, response.text
    assert response.json()["total_amount"] == "240.00"

    updated = client.get(f"/products/{product['id']}", headers=headers)
    assert updated.json()["stock_quantity"] == 3

    movements = client.get(f"/stock-movements?product_id={product['id']}", headers=headers)
    assert movements.status_code == 200
    assert any(item["type"] == "SAIDA_VENDA" for item in movements.json())


def test_sale_blocks_when_stock_is_insufficient(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    product = create_product(client, headers, stock=1)

    response = client.post(
        "/sales",
        headers=headers,
        json={"payment_method": "PIX", "notes": None, "items": [{"product_id": product["id"], "quantity": 2}]},
    )
    assert response.status_code == 400

    updated = client.get(f"/products/{product['id']}", headers=headers)
    assert updated.json()["stock_quantity"] == 1


def test_basic_admin_vs_reception_permissions(client: TestClient) -> None:
    admin_headers = create_admin_and_headers(client)
    create_user = client.post(
        "/users",
        headers=admin_headers,
        json={
            "name": "Recepcao",
            "email": "recepcao@example.com",
            "password": "recepcao123",
            "role": "RECEPCAO",
            "is_active": True,
        },
    )
    assert create_user.status_code == 201, create_user.text
    login = client.post("/auth/login", json={"email": "recepcao@example.com", "password": "recepcao123"})
    reception_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    assert client.get("/users", headers=reception_headers).status_code == 403
    student = create_student(client, reception_headers)
    assert client.delete(f"/students/{student['id']}", headers=reception_headers).status_code == 403
    assert client.post(
        "/products",
        headers=reception_headers,
        json={
            "name": "Creatina",
            "category": "Suplemento",
            "cost_price": 40,
            "sale_price": 70,
            "stock_quantity": 2,
            "min_stock": 1,
            "status": "ATIVO",
        },
    ).status_code == 403


def test_overdue_payment_marks_student_as_defaulter(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    student = create_student(client, headers)
    response = client.post(
        "/payments",
        headers=headers,
        json={
            "student_id": student["id"],
            "amount": 120,
            "due_date": str(date.today() - timedelta(days=2)),
            "paid_at": None,
            "status": "PENDENTE",
            "payment_method": "PIX",
            "notes": None,
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "ATRASADO"

    updated_student = client.get(f"/students/{student['id']}", headers=headers).json()
    assert updated_student["status"] == "INADIMPLENTE"


def test_import_students_from_csv_and_records_audit(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    csv_content = (
        "nome;telefone;email;plano;mensalidade;vencimento;status\n"
        "Joao Importado;11911112222;joao@example.com;Mensal;99,90;5;ATIVO\n"
    )
    response = client.post(
        "/students/import",
        headers=headers,
        files={"file": ("alunos.csv", csv_content.encode("utf-8"), "text/csv")},
    )
    assert response.status_code == 200, response.text
    assert response.json()["imported"] == 1

    students = client.get("/students?search=Importado", headers=headers)
    assert students.status_code == 200
    assert students.json()[0]["monthly_fee"] == "99.90"

    audit = client.get("/audit-logs?entity_type=STUDENT&action=IMPORT", headers=headers)
    assert audit.status_code == 200
    assert audit.json()[0]["action"] == "IMPORT"


def test_generate_monthly_payments_is_idempotent(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    create_student(client, headers)

    payload = {"year": 2026, "month": 8}
    first = client.post("/payments/generate-monthly", headers=headers, json=payload)
    assert first.status_code == 200, first.text
    assert first.json()["generated"] == 1
    assert first.json()["skipped_existing"] == 0

    second = client.post("/payments/generate-monthly", headers=headers, json=payload)
    assert second.status_code == 200, second.text
    assert second.json()["generated"] == 0
    assert second.json()["skipped_existing"] == 1

    payments = client.get("/payments?status=PENDENTE", headers=headers)
    assert payments.status_code == 200
    assert len(payments.json()) == 1


def test_reports_csv_exports_and_audit_permissions(client: TestClient) -> None:
    admin_headers = create_admin_and_headers(client)
    student = create_student(client, admin_headers)
    client.post(
        "/payments",
        headers=admin_headers,
        json={
            "student_id": student["id"],
            "amount": 120,
            "due_date": str(date.today()),
            "paid_at": str(date.today()),
            "status": "PAGO",
            "payment_method": "PIX",
            "notes": None,
        },
    )

    create_user = client.post(
        "/users",
        headers=admin_headers,
        json={
            "name": "Recepcao CSV",
            "email": "recepcaocsv@example.com",
            "password": "recepcao123",
            "role": "RECEPCAO",
            "is_active": True,
        },
    )
    assert create_user.status_code == 201
    login = client.post("/auth/login", json={"email": "recepcaocsv@example.com", "password": "recepcao123"})
    reception_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    csv_response = client.get("/reports/payments-received.csv", headers=admin_headers)
    assert csv_response.status_code == 200
    assert "mensalidades-recebidas.csv" in csv_response.headers["content-disposition"]
    assert "Maria Silva" in csv_response.text

    assert client.get("/audit-logs", headers=reception_headers).status_code == 403
    assert client.get("/audit-logs", headers=admin_headers).status_code == 200
