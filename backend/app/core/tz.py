"""Utilitarios de fuso horario de negocio (America/Sao_Paulo).

`created_at` e armazenado como instante absoluto (TIMESTAMPTZ, via datetime.now(utc)).
Os relatorios/dashboard precisam raciocinar em datas locais do negocio, entao os
limites de dia/mes sao construidos no fuso de Sao Paulo e convertidos para UTC antes
de comparar com a coluna. Isso funciona tanto no PostgreSQL (comparacao por instante)
quanto no SQLite dos testes (onde os instantes ficam gravados como hora UTC).
"""

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

BUSINESS_TZ = ZoneInfo("America/Sao_Paulo")


def business_today() -> date:
    """Data atual no fuso de negocio (nao no fuso do servidor)."""
    return datetime.now(BUSINESS_TZ).date()


def day_start_utc(day: date) -> datetime:
    """Inicio do dia (00:00) no fuso de negocio, convertido para UTC."""
    return datetime.combine(day, time.min, tzinfo=BUSINESS_TZ).astimezone(timezone.utc)


def day_after_utc(day: date) -> datetime:
    """Inicio do dia seguinte (limite superior exclusivo) no fuso de negocio, em UTC."""
    return day_start_utc(day + timedelta(days=1))


def to_business_date(moment: datetime) -> date:
    """Converte um instante (aware ou assumido UTC) para a data local de negocio."""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(BUSINESS_TZ).date()
