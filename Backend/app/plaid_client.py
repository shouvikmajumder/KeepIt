"""Only this server talks to Plaid with permanent credentials."""
import httpx
from cryptography.fernet import Fernet
from fastapi import HTTPException
from .config import settings


class PlaidError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def require_plaid():
    if not all((settings.plaid_client_id, settings.plaid_secret, settings.token_encryption_key,
                settings.database_url)):
        raise HTTPException(503, "Bank connections are not configured yet. You can add manually.")
    if settings.plaid_environment not in ("sandbox", "production"):
        raise HTTPException(503, "Unsupported Plaid environment")


def plaid(path: str, **body):
    require_plaid()
    try:
        response = httpx.post(f"https://{settings.plaid_environment}.plaid.com{path}",
            json={"client_id": settings.plaid_client_id, "secret": settings.plaid_secret, **body}, timeout=25)
        payload = response.json()
    except (httpx.HTTPError, ValueError):
        raise PlaidError("PROVIDER_UNAVAILABLE") from None
    if response.is_error:
        # Never propagate raw responses: they can include account identifiers.
        raise PlaidError(payload.get("error_code", "PROVIDER_UNAVAILABLE"))
    return payload


def encrypt(token: str) -> str:
    return Fernet(settings.token_encryption_key.encode()).encrypt(token.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return Fernet(settings.token_encryption_key.encode()).decrypt(ciphertext.encode()).decode()
