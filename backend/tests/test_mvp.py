from datetime import date, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient

from app.models.enums import PaymentMethod, PaymentStatus
from app.models.payment import Payment, PaymentSplit
from tests.conftest import TestingSessionLocal, create_admin_and_headers, create_product, create_student


def test_initial_admin_login_and_me(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    response = client.get("/auth/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["role"] == "ADMIN"


def test_create_student(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    student = create_student(client, headers)
    assert student["name"] == "Maria Silva"
    assert student["address"] == "Rua das Flores, 100 - Centro"
    assert student["plan_start_date"] == "2026-07-01"

    response = client.get("/students?search=Maria", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_create_student_with_initial_open_payment(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    today = date.today()
    due_day = today.day if today.day > 21 else today.day + 7
    expected_due_date = date(today.year, today.month, due_day)
    response = client.post(
        "/students",
        headers=headers,
        json={
            "name": "Ana Costa",
            "phone": "11984561234",
            "email": "ana.inicial@example.com",
            "cpf": None,
            "address": "Rua Inicial, 10 - Centro",
            "birth_date": None,
            "plan": "Mensal",
            "plan_start_date": str(today),
            "monthly_fee": 75,
            "due_day": due_day,
            "status": "ATIVO",
            "notes": None,
        },
    )
    assert response.status_code == 201, response.text
    student = response.json()

    payments = client.get(f"/students/{student['id']}/payments", headers=headers)
    assert payments.status_code == 200, payments.text
    assert len(payments.json()) == 1
    payment = payments.json()[0]
    assert payment["amount"] == "75.00"
    assert payment["due_date"] == str(expected_due_date)
    assert payment["status"] == "PENDENTE"

    report = client.get("/reports/payments-open", headers=headers)
    assert report.status_code == 200, report.text
    assert report.json()[0]["id"] == payment["id"]

    csv_response = client.get("/reports/payments-open.csv", headers=headers)
    assert csv_response.status_code == 200
    assert "mensalidades-em-aberto.csv" in csv_response.headers["content-disposition"]
    assert "Ana Costa" in csv_response.text


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


def test_paid_payment_accepts_split_methods_and_validates_total(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    student = create_student(client, headers)

    response = client.post(
        "/payments",
        headers=headers,
        json={
            "student_id": student["id"],
            "amount": 75,
            "due_date": str(date.today()),
            "paid_at": str(date.today()),
            "status": "PAGO",
            "payment_method": "PIX",
            "splits": [
                {"payment_method": "CARTAO", "amount": 50},
                {"payment_method": "DINHEIRO", "amount": 25},
            ],
            "notes": "Mensalidade dividida",
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "PAGO"
    assert body["payment_method"] == "OUTRO"
    assert body["splits"] == [
        {
            "id": body["splits"][0]["id"],
            "payment_id": body["id"],
            "payment_method": "CARTAO",
            "amount": "50.00",
            "created_at": body["splits"][0]["created_at"],
        },
        {
            "id": body["splits"][1]["id"],
            "payment_id": body["id"],
            "payment_method": "DINHEIRO",
            "amount": "25.00",
            "created_at": body["splits"][1]["created_at"],
        },
    ]

    invalid = client.post(
        "/payments",
        headers=headers,
        json={
            "student_id": student["id"],
            "amount": 75,
            "due_date": str(date.today() + timedelta(days=1)),
            "paid_at": str(date.today()),
            "status": "PAGO",
            "payment_method": "PIX",
            "splits": [
                {"payment_method": "CARTAO", "amount": 50},
                {"payment_method": "DINHEIRO", "amount": 20},
            ],
            "notes": None,
        },
    )
    assert invalid.status_code == 400
    assert "soma" in invalid.json()["detail"]


def test_list_payments_serializes_zero_amount_split(client: TestClient) -> None:
    # Regressao: a migracao de splits copiou o valor de mensalidades PAGO,
    # inclusive as com amount=0.00 (canceladas por duplicidade). O split
    # zerado nao pode quebrar a serializacao de GET /payments com 500.
    headers = create_admin_and_headers(client)
    student = create_student(client, headers)

    with TestingSessionLocal() as db:
        payment = Payment(
            student_id=student["id"],
            amount=Decimal("0.00"),
            due_date=date.today(),
            paid_at=date.today(),
            status=PaymentStatus.PAGO,
            payment_method=PaymentMethod.PIX,
        )
        db.add(payment)
        db.flush()
        db.add(PaymentSplit(payment_id=payment.id, payment_method=PaymentMethod.PIX, amount=Decimal("0.00")))
        db.commit()

    response = client.get("/payments", headers=headers)
    assert response.status_code == 200, response.text
    zeroed = next(p for p in response.json() if p["amount"] == "0.00")
    assert zeroed["splits"][0]["amount"] == "0.00"


def test_mark_zero_amount_payment_paid_without_splits(client: TestClient) -> None:
    # Regressao: quitar uma mensalidade legada de valor 0.00 sem informar splits
    # nao pode explodir ao reconstruir a composicao (PaymentSplitCreate exige > 0).
    headers = create_admin_and_headers(client)
    student = create_student(client, headers)

    with TestingSessionLocal() as db:
        payment = Payment(
            student_id=student["id"],
            amount=Decimal("0.00"),
            due_date=date.today(),
            status=PaymentStatus.PENDENTE,
            payment_method=PaymentMethod.PIX,
        )
        db.add(payment)
        db.commit()
        payment_id = payment.id

    response = client.patch(
        f"/payments/{payment_id}/pay",
        headers=headers,
        json={"paid_at": str(date.today())},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "PAGO"
    assert body["splits"][0]["amount"] == "0.00"


def test_manual_paid_registration_settles_existing_open_payment(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    student = create_student(client, headers)
    due_date = date.today().replace(day=20)

    pending = client.post(
        "/payments",
        headers=headers,
        json={
            "student_id": student["id"],
            "amount": 75,
            "due_date": str(due_date),
            "paid_at": None,
            "status": "PENDENTE",
            "payment_method": "PIX",
            "notes": "Mensalidade inicial",
        },
    )
    assert pending.status_code == 201, pending.text

    paid = client.post(
        "/payments",
        headers=headers,
        json={
            "student_id": student["id"],
            "amount": 75,
            "due_date": str(due_date),
            "paid_at": str(date.today()),
            "status": "PAGO",
            "payment_method": "PIX",
            "notes": "Pago no balcao",
        },
    )
    assert paid.status_code == 201, paid.text
    assert paid.json()["id"] == pending.json()["id"]
    assert paid.json()["status"] == "PAGO"
    assert paid.json()["paid_at"] == str(date.today())

    history = client.get(f"/students/{student['id']}/payments", headers=headers)
    assert history.status_code == 200
    assert len(history.json()) == 1
    assert history.json()[0]["status"] == "PAGO"

    duplicate = client.post(
        "/payments",
        headers=headers,
        json={
            "student_id": student["id"],
            "amount": 75,
            "due_date": str(due_date),
            "paid_at": None,
            "status": "PENDENTE",
            "payment_method": "PIX",
            "notes": None,
        },
    )
    assert duplicate.status_code == 400


def test_reception_can_cancel_duplicate_payment(client: TestClient) -> None:
    admin_headers = create_admin_and_headers(client)
    student = create_student(client, admin_headers)
    create_user = client.post(
        "/users",
        headers=admin_headers,
        json={
            "name": "Recepcao",
            "email": "recepcao.cancelamento@example.com",
            "password": "recepcao123",
            "role": "RECEPCAO",
            "is_active": True,
        },
    )
    assert create_user.status_code == 201, create_user.text
    login = client.post("/auth/login", json={"email": "recepcao.cancelamento@example.com", "password": "recepcao123"})
    reception_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    payload = {
        "student_id": student["id"],
        "amount": 75,
        "due_date": "2026-09-15",
        "paid_at": "2026-09-01",
        "status": "PAGO",
        "payment_method": "PIX",
        "notes": "OK",
    }

    first = client.post("/payments", headers=admin_headers, json=payload)
    assert first.status_code == 201, first.text

    with TestingSessionLocal() as db:
        duplicate_payment = Payment(
            student_id=student["id"],
            amount=75,
            due_date=date(2026, 9, 15),
            paid_at=date(2026, 9, 1),
            status=PaymentStatus.PAGO,
            payment_method=PaymentMethod.PIX,
            notes="OK",
        )
        db.add(duplicate_payment)
        db.commit()
        duplicate_id = duplicate_payment.id

    canceled = client.patch(
        f"/payments/{duplicate_id}/cancel",
        headers=reception_headers,
        json={"reason": "Lancamento duplicado"},
    )
    assert canceled.status_code == 200, canceled.text
    assert canceled.json()["status"] == "CANCELADO"
    assert canceled.json()["paid_at"] is None
    assert "Lancamento duplicado" in canceled.json()["notes"]

    history = client.get(f"/students/{student['id']}/payments", headers=admin_headers)
    assert history.status_code == 200
    statuses = {payment["id"]: payment["status"] for payment in history.json()}
    assert statuses[first.json()["id"]] == "PAGO"
    assert statuses[duplicate_id] == "CANCELADO"

    default_list = client.get("/payments", headers=admin_headers)
    assert default_list.status_code == 200
    assert duplicate_id not in {payment["id"] for payment in default_list.json()}

    canceled_list = client.get("/payments?status=CANCELADO", headers=admin_headers)
    assert canceled_list.status_code == 200
    assert duplicate_id in {payment["id"] for payment in canceled_list.json()}

    second_cancel = client.patch(
        f"/payments/{duplicate_id}/cancel",
        headers=reception_headers,
        json={"reason": "Tentativa repetida"},
    )
    assert second_cancel.status_code == 400


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


def test_manual_stock_out_decrements_stock_and_blocks_negative_balance(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    product = create_product(client, headers, stock=5)

    response = client.post(
        "/stock-movements",
        headers=headers,
        json={"product_id": product["id"], "type": "SAIDA", "quantity": 2, "reason": "Perda/uso interno"},
    )
    assert response.status_code == 201, response.text
    assert client.get(f"/products/{product['id']}", headers=headers).json()["stock_quantity"] == 3

    blocked = client.post(
        "/stock-movements",
        headers=headers,
        json={"product_id": product["id"], "type": "SAIDA", "quantity": 4, "reason": "Retirada acima do saldo"},
    )
    assert blocked.status_code == 400
    assert client.get(f"/products/{product['id']}", headers=headers).json()["stock_quantity"] == 3


def test_admin_can_edit_product_without_bypassing_stock_history(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    product = create_product(client, headers, stock=4)

    response = client.patch(
        f"/products/{product['id']}",
        headers=headers,
        json={
            "name": "Whey Protein Premium",
            "category": "Proteinas",
            "cost_price": 82.346,
            "sale_price": 149.9,
            "min_stock": 3,
            "status": "INATIVO",
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Whey Protein Premium"
    assert response.json()["category"] == "Proteinas"
    assert response.json()["cost_price"] == "82.35"
    assert response.json()["sale_price"] == "149.90"
    assert response.json()["min_stock"] == 3
    assert response.json()["status"] == "INATIVO"
    assert response.json()["stock_quantity"] == 4

    stock_bypass = client.patch(
        f"/products/{product['id']}",
        headers=headers,
        json={"stock_quantity": 99},
    )
    assert stock_bypass.status_code == 422
    assert client.get(f"/products/{product['id']}", headers=headers).json()["stock_quantity"] == 4


def test_sale_decrements_stock_and_creates_movement(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    student = create_student(client, headers)
    product = create_product(client, headers, stock=5)

    response = client.post(
        "/sales",
        headers=headers,
        json={
            "student_id": student["id"],
            "payment_method": "DINHEIRO",
            "notes": None,
            "items": [{"product_id": product["id"], "quantity": 2}],
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["total_amount"] == "240.00"
    assert response.json()["student"]["id"] == student["id"]

    updated = client.get(f"/products/{product['id']}", headers=headers)
    assert updated.json()["stock_quantity"] == 3

    movements = client.get(f"/stock-movements?product_id={product['id']}", headers=headers)
    assert movements.status_code == 200
    assert any(item["type"] == "SAIDA_VENDA" for item in movements.json())

    history = client.get(f"/students/{student['id']}/sales", headers=headers)
    assert history.status_code == 200
    assert history.json()[0]["id"] == response.json()["id"]


def test_sale_requires_student_and_supports_informal_installments(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    student = create_student(client, headers)
    product = create_product(client, headers, stock=5)

    missing_student = client.post(
        "/sales",
        headers=headers,
        json={"payment_method": "PIX", "notes": None, "items": [{"product_id": product["id"], "quantity": 1}]},
    )
    assert missing_student.status_code == 422

    response = client.post(
        "/sales",
        headers=headers,
        json={
            "student_id": student["id"],
            "payment_method": "PRAZO",
            "installments_count": 3,
            "installment_payment_method": "PIX",
            "first_due_date": str(date.today() + timedelta(days=10)),
            "notes": "3x informal",
            "items": [{"product_id": product["id"], "quantity": 1}],
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["payment_method"] == "PRAZO"
    assert response.json()["installments_count"] == 3
    assert response.json()["installment_payment_method"] == "PIX"
    assert len(response.json()["installments"]) == 3
    assert response.json()["installments"][0]["status"] == "ABERTA"


def test_sale_on_credit_creates_future_invoice_and_allows_specific_payment(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    student = create_student(client, headers)
    product = create_product(client, headers, stock=5)
    due_date = date.today() + timedelta(days=14)

    response = client.post(
        "/sales",
        headers=headers,
        json={
            "student_id": student["id"],
            "payment_method": "PRAZO",
            "installments_count": 1,
            "installment_payment_method": "PIX",
            "first_due_date": str(due_date),
            "notes": "Pagar no dia combinado",
            "items": [{"product_id": product["id"], "quantity": 1}],
        },
    )
    assert response.status_code == 201, response.text
    installment = response.json()["installments"][0]
    assert installment["amount"] == "120.00"
    assert installment["due_date"] == str(due_date)
    assert installment["status"] == "ABERTA"

    invoices = client.get(f"/sales/installments?student_id={student['id']}&status=ABERTA", headers=headers)
    assert invoices.status_code == 200, invoices.text
    assert invoices.json()[0]["id"] == installment["id"]

    paid = client.patch(
        f"/sales/installments/{installment['id']}/pay",
        headers=headers,
        json={"paid_at": str(due_date), "payment_method": "PIX", "notes": "Quitado no PIX"},
    )
    assert paid.status_code == 200, paid.text
    assert paid.json()["status"] == "PAGA"
    assert paid.json()["paid_at"] == str(due_date)
    assert paid.json()["payment_method"] == "PIX"

    history = client.get(f"/students/{student['id']}/sales", headers=headers)
    assert history.status_code == 200
    assert history.json()[0]["installments"][0]["status"] == "PAGA"


def test_sale_on_credit_accepts_individual_due_dates(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    student = create_student(client, headers)
    product = create_product(client, headers, stock=5)
    due_dates = [date.today() + timedelta(days=7), date.today() + timedelta(days=20), date.today() + timedelta(days=45)]

    response = client.post(
        "/sales",
        headers=headers,
        json={
            "student_id": student["id"],
            "payment_method": "PRAZO",
            "installments_count": 3,
            "installment_payment_method": "PIX",
            "installment_due_dates": [str(day) for day in due_dates],
            "notes": "Datas combinadas manualmente",
            "items": [{"product_id": product["id"], "quantity": 1}],
        },
    )
    assert response.status_code == 201, response.text
    installments = response.json()["installments"]
    assert [item["due_date"] for item in installments] == [str(day) for day in due_dates]


def test_admin_can_cancel_sale_and_restore_stock_and_invoices(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    student = create_student(client, headers)
    product = create_product(client, headers, stock=5)

    sale = client.post(
        "/sales",
        headers=headers,
        json={
            "student_id": student["id"],
            "payment_method": "PRAZO",
            "installments_count": 2,
            "installment_payment_method": "PIX",
            "installment_due_dates": [str(date.today()), str(date.today() + timedelta(days=30))],
            "notes": "Venda a cancelar",
            "items": [{"product_id": product["id"], "quantity": 2}],
        },
    )
    assert sale.status_code == 201, sale.text
    assert client.get(f"/products/{product['id']}", headers=headers).json()["stock_quantity"] == 3

    canceled = client.patch(
        f"/sales/{sale.json()['id']}/cancel",
        headers=headers,
        json={"reason": "Lancamento incorreto"},
    )
    assert canceled.status_code == 200, canceled.text
    assert canceled.json()["status"] == "CANCELADA"
    assert canceled.json()["cancel_reason"] == "Lancamento incorreto"
    assert all(item["status"] == "CANCELADA" for item in canceled.json()["installments"])
    assert client.get(f"/products/{product['id']}", headers=headers).json()["stock_quantity"] == 5

    sales_report = client.get("/reports/sales", headers=headers)
    assert sales_report.status_code == 200
    assert sales_report.json() == []

    second_cancel = client.patch(f"/sales/{sale.json()['id']}/cancel", headers=headers, json={"reason": None})
    assert second_cancel.status_code == 400


def test_sale_blocks_when_stock_is_insufficient(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    student = create_student(client, headers)
    product = create_product(client, headers, stock=1)

    response = client.post(
        "/sales",
        headers=headers,
        json={
            "student_id": student["id"],
            "payment_method": "PIX",
            "notes": None,
            "items": [{"product_id": product["id"], "quantity": 2}],
        },
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
    product = create_product(client, admin_headers)
    assert client.patch(
        f"/products/{product['id']}",
        headers=reception_headers,
        json={"name": "Creatina editada"},
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
        "nome;telefone;email;endereco;plano;data_inicio;mensalidade;vencimento;status\n"
        "Joao Importado;11911112222;joao@example.com;Rua Importada, 45 - Centro;Mensal;15/06/2026;99,90;5;ATIVO\n"
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
    assert students.json()[0]["address"] == "Rua Importada, 45 - Centro"
    assert students.json()[0]["plan_start_date"] == "2026-06-15"

    audit = client.get("/audit-logs?entity_type=STUDENT&action=IMPORT", headers=headers)
    assert audit.status_code == 200
    assert audit.json()[0]["action"] == "IMPORT"


def test_generate_monthly_payments_is_idempotent(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    create_student(client, headers)

    next_month = (date.today().replace(day=1) + timedelta(days=32)).replace(day=1)
    payload = {"year": next_month.year, "month": next_month.month}
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


def test_generate_monthly_payments_respects_student_start_date(client: TestClient) -> None:
    headers = create_admin_and_headers(client)
    create_student(client, headers)

    before_start = client.post("/payments/generate-monthly", headers=headers, json={"year": 2026, "month": 6})
    assert before_start.status_code == 200, before_start.text
    assert before_start.json()["generated"] == 0

    after_start = client.post("/payments/generate-monthly", headers=headers, json={"year": 2026, "month": 7})
    assert after_start.status_code == 200, after_start.text
    assert after_start.json()["generated"] == 1


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
