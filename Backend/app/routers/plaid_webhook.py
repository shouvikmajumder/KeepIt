import hashlib
import hmac
import json
import time
import jwt
from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from ..plaid_client import plaid
from ..postgres import transaction, enqueue

router = APIRouter()


def verify(raw: bytes, token: str):
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") != "ES256" or not isinstance(header.get("kid"), str):
            raise ValueError("Invalid signing header")
        key = plaid("/webhook_verification_key/get", key_id=header["kid"])["key"]
        if key.get("expired_at") is not None:
            raise ValueError("Expired signing key")
        claims = jwt.decode(token, jwt.PyJWK.from_dict(key).key, algorithms=["ES256"],
                            options={"require": ["iat", "request_body_sha256"]})
        # A valid signature alone is insufficient: bind it to this exact body and age.
        if not 0 <= time.time() - claims["iat"] <= 300:
            raise ValueError("Stale webhook")
        if not hmac.compare_digest(hashlib.sha256(raw).hexdigest(), claims["request_body_sha256"]):
            raise ValueError("Body mismatch")
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        raise HTTPException(401, "Invalid webhook") from None


def receive(raw: bytes, token: str):
    verify(raw, token)
    try:
        event = json.loads(raw)
        item_id = event.get("item_id")
    except (ValueError, AttributeError):
        raise HTTPException(400, "Invalid webhook payload") from None
    if not isinstance(item_id, str):
        return {"received": True}
    with transaction() as db:
        connection = db.execute("select id from keepit_private.connections where item_id=%s for update",
                                (item_id,)).fetchone()
        if connection:
            enqueue(db, connection["id"])
    return {"received": True}


@router.post("/webhooks/plaid")
async def webhook(request: Request):
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 262144:
            raise HTTPException(413, "Webhook too large")
    return await run_in_threadpool(receive, bytes(raw), request.headers.get("plaid-verification", ""))
