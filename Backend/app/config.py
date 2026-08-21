"""Backend configuration, loaded once from `Backend/.env`.

pydantic-settings reads matching environment variables (case-insensitive), so
`SUPABASE_URL` in the .env file populates `settings.supabase_url`. Importing
`settings` anywhere gives the whole app one validated copy of these values.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Same Supabase project the app talks to. Also used to derive the JWKS URL
    # (auth/v1/.well-known/jwks.json) for verifying access-token signatures.
    supabase_url: str
    # service_role key: bypasses RLS, so it stays server-side only.
    supabase_service_role_key: str

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()  # raises on startup if any required var is missing
