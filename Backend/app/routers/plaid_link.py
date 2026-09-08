from hashlib import sha256
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from ..auth import get_current_user_id
from ..config import settings
from ..plaid_client import plaid, decrypt, encrypt
from ..postgres import transaction, owned_connection, enqueue

router = APIRouter(prefix="/plaid", tags=["connections"])


class LinkRequest(BaseModel):
    connection_id: UUID | None = None


class ExchangeRequest(BaseModel):
    public_token: str = Field(min_length=1, max_length=2048)


@router.post("/link-token")
def link_token(body: LinkRequest, user_id: str = Depends(get_current_user_id)):
    payload = dict(user={"client_user_id": user_id}, client_name="KeepIt",
                   country_codes=["US"], language="en", webhook=settings.plaid_webhook_url)
    if settings.plaid_redirect_uri:
        payload["redirect_uri"] = settings.plaid_redirect_uri
    if body.connection_id:
        with transaction() as db:
            connection = owned_connection(db, body.connection_id, user_id)
            payload["access_token"] = decrypt(connection["token_ciphertext"])
    else:
        payload.update(products=["transactions"], transactions={"days_requested": 730},
                       additional_consented_products=["recurring_transactions"])
    return {"link_token": plaid("/link/token/create", **payload)["link_token"]}


@router.post("/exchange")
def exchange(body: ExchangeRequest, user_id: str = Depends(get_current_user_id)):
    digest = sha256(body.public_token.encode()).hexdigest()
    with transaction() as db:
        # Serialize this user's exchanges so a retried request reuses its result.
        db.execute("select pg_advisory_xact_lock(hashtextextended(%s, 0))", (user_id,))
        if not db.execute("select id from auth.users where id=%s", (user_id,)).fetchone():
            raise HTTPException(401, "Account no longer exists")
        existing = db.execute("select id from keepit_private.connections where exchange_hash=%s and user_id=%s",
                              (digest, user_id)).fetchone()
        if existing:
            return existing
        result = plaid("/item/public_token/exchange", public_token=body.public_token)
        connection = db.execute("""insert into keepit_private.connections
            (user_id, item_id, token_ciphertext, exchange_hash) values (%s,%s,%s,%s) returning id""",
            (user_id, result["item_id"], encrypt(result["access_token"]), digest)).fetchone()
        enqueue(db, connection["id"])
        return connection


@router.post("/connections/{connection_id}/refresh", status_code=202)
def refresh(connection_id: UUID, user_id: str = Depends(get_current_user_id)):
    with transaction() as db:
        owned_connection(db, connection_id, user_id)
        enqueue(db, connection_id)
    return {"status": "queued"}
