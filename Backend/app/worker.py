"""Run separately with python -m app.worker; jobs survive process restarts."""
import logging
import time
from psycopg.types.json import Jsonb
from .discovery import store_stream
from .plaid_client import PlaidError, plaid, decrypt, require_plaid
from .postgres import transaction


def sync(db, connection):
    token = decrypt(connection["token_ciphertext"])
    response = plaid("/accounts/get", access_token=token)
    accounts = [{"id": a["account_id"], "label": a["name"] + (f" ••{a['mask']}" if a.get("mask") else "")}
                for a in response["accounts"] if a["type"] in ("credit", "depository")]
    name = connection["institution_name"]
    institution_id = response["item"].get("institution_id")
    if institution_id and not connection["institution_id"]:
        name = plaid("/institutions/get_by_id", institution_id=institution_id, country_codes=["US"])["institution"]["name"]
    db.execute("""update keepit_private.connections set accounts=%s,institution_id=%s,
        institution_name=%s where id=%s""", (Jsonb(accounts), institution_id, name, connection["id"]))
    connection["accounts"] = accounts
    result = plaid("/transactions/recurring/get", access_token=token)
    for stream in result["outflow_streams"]:
        store_stream(db, connection, stream)
    db.execute("""update keepit_private.connections set sync_status='ready',
        last_synced_at=now(),error_code=null where id=%s""", (connection["id"],))


def run_once():
    with transaction() as db:
        # All operations lock the connection before jobs/candidates. This avoids
        # lock-order deadlocks and prevents a disconnected account being reimported.
        connection = db.execute("""select c.*, j.attempts from keepit_private.connections c
            join keepit_private.jobs j on j.connection_id=c.id where j.available_at<=now()
            order by j.available_at limit 1 for update of c skip locked""").fetchone()
        if not connection:
            return False
        try:
            with db.transaction():
                sync(db, connection)
        except Exception as exc:
            code = exc.code if isinstance(exc, PlaidError) else "INTERNAL_ERROR"
            pending = code == "PRODUCT_NOT_READY"
            reconnect = code in ("ITEM_LOGIN_REQUIRED", "INVALID_ACCESS_TOKEN", "ITEM_NOT_FOUND", "ITEM_ACCESS_NOT_GRANTED")
            state = "needs_reconnect" if reconnect else "syncing" if pending else "error"
            delay = min(3600, 30 * 2 ** min(connection["attempts"], 7))
            db.execute("update keepit_private.connections set sync_status=%s,error_code=%s where id=%s",
                       (state, code, connection["id"]))
            db.execute("""update keepit_private.jobs set attempts=attempts+1,
                available_at=now()+(%s * interval '1 second') where connection_id=%s""", (delay, connection["id"]))
            logging.warning("Discovery will retry: %s", code)
        else:
            # Daily reconciliation also catches a missed webhook.
            db.execute("""update keepit_private.jobs set attempts=0,
                available_at=now()+interval '24 hours' where connection_id=%s""", (connection["id"],))
        return True


if __name__ == "__main__":
    require_plaid()
    while True:
        try:
            if run_once():
                continue
        except Exception as exc:
            logging.error("Worker unavailable: %s", type(exc).__name__)
        time.sleep(5)
