from app.core.config import Settings


def test_database_url_uses_psycopg_driver_for_provider_urls() -> None:
    postgres = Settings(database_url="postgresql://user:pass@example.com:5432/acacademia")
    legacy = Settings(database_url="postgres://user:pass@example.com:5432/acacademia")

    assert postgres.database_url == "postgresql+psycopg://user:pass@example.com:5432/acacademia"
    assert legacy.database_url == "postgresql+psycopg://user:pass@example.com:5432/acacademia"


def test_cors_origins_accept_comma_separated_env_string() -> None:
    settings = Settings(backend_cors_origins="https://acacademia.netlify.app,https://admin.example.com")

    assert settings.backend_cors_origins == ["https://acacademia.netlify.app", "https://admin.example.com"]
