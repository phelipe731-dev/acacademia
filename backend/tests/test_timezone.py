from datetime import date, datetime, timezone

from app.core.tz import day_after_utc, day_start_utc, to_business_date


def test_day_start_utc_reflects_sao_paulo_offset() -> None:
    # 01/07 00:00 em Sao Paulo (UTC-3) == 01/07 03:00 UTC.
    assert day_start_utc(date(2026, 7, 1)) == datetime(2026, 7, 1, 3, 0, tzinfo=timezone.utc)


def test_day_after_utc_is_next_day_start() -> None:
    assert day_after_utc(date(2026, 7, 31)) == datetime(2026, 8, 1, 3, 0, tzinfo=timezone.utc)


def test_sale_near_month_end_stays_in_local_month() -> None:
    # Venda em 31/07 22:30 (horario de Sao Paulo) e gravada como 01/08 01:30 UTC.
    stored_utc = datetime(2026, 8, 1, 1, 30, tzinfo=timezone.utc)
    # A data local de negocio ainda e 31/07 (nao vaza para agosto).
    assert to_business_date(stored_utc) == date(2026, 7, 31)
    # E cai dentro do intervalo de julho (limite superior exclusivo no inicio de agosto).
    assert day_start_utc(date(2026, 7, 1)) <= stored_utc < day_after_utc(date(2026, 7, 31))


def test_to_business_date_assumes_utc_for_naive() -> None:
    # Instante naive (como o SQLite devolve) e tratado como UTC.
    naive_utc = datetime(2026, 8, 1, 1, 30)
    assert to_business_date(naive_utc) == date(2026, 7, 31)
