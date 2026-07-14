from functools import lru_cache

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Ambientes tratados como "nao-producao": defaults fracos sao tolerados apenas aqui.
NON_PRODUCTION_ENVIRONMENTS = {"local", "dev", "development", "test", "testing"}
# Valores que nunca podem ir para producao.
INSECURE_SECRETS = {"", "change-me", "troque-esta-chave-em-producao"}
INSECURE_PASSWORDS = {"", "admin123", "123456", "password", "senha", "mudar"}


class Settings(BaseSettings):
    app_name: str = "AC Academia"
    environment: str = "local"
    database_url: str = "postgresql+psycopg://ac_academia:ac_academia@localhost:5432/ac_academia"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 720
    auth_cookie_name: str = "ac_academia_token"
    # Marca o cookie como Secure fora de "local". Sobrescreva para False se rodar
    # producao sem HTTPS na frente (nao recomendado).
    auth_cookie_secure: bool | None = None
    backend_cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    auto_create_admin: bool = True
    first_admin_name: str = "Administrador"
    first_admin_email: str = "admin@acacademia.com.br"
    first_admin_password: str = "admin123"
    frontend_public_url: str = "http://localhost:3000"
    upload_dir: str = "uploads"
    training_media_max_bytes: int = 10 * 1024 * 1024

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() not in NON_PRODUCTION_ENVIRONMENTS

    @property
    def cookie_secure(self) -> bool:
        # Default: Secure quando em producao; explicitamente configuravel via env.
        return self.is_production if self.auth_cookie_secure is None else self.auth_cookie_secure

    @field_validator("backend_cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def enforce_production_safety(self) -> "Settings":
        """Impede subir em producao com segredos/credenciais padrao ou CORS permissivo."""
        if not self.is_production:
            return self
        if self.secret_key.strip() in INSECURE_SECRETS or len(self.secret_key) < 32:
            raise ValueError(
                "SECRET_KEY inseguro para producao: defina um valor aleatorio com pelo menos 32 caracteres "
                "(ex.: `python -c \"import secrets; print(secrets.token_urlsafe(48))\"`)."
            )
        if "*" in self.backend_cors_origins:
            raise ValueError("BACKEND_CORS_ORIGINS nao pode conter '*' com credenciais habilitadas.")
        if self.auto_create_admin and self.first_admin_password.strip() in INSECURE_PASSWORDS:
            raise ValueError(
                "FIRST_ADMIN_PASSWORD inseguro para producao: defina uma senha forte ou desative AUTO_CREATE_ADMIN."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
