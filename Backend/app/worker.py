"""Run separately with python -m app.worker; jobs survive process restarts."""
import logging
import time
from psycopg.types.json import Jsonb
from .reconciliation import reconcile
from .classification import CLASSIFIER_VERSION
from .plaid_client import PlaidError, plaid, decrypt, require_plaid
from .postgres import transaction
from .transactions import prune_transactions, remove_transaction, store_transaction


def sync_transactions(db, connection, token, accounts):
    cursor = connection.get("transaction_cursor")
    complete = True
    while True:
        body = {"access_token": token, "count": 500,
                "options": {"personal_finance_category_version": "v2"}}
        if cursor:
            body["cursor"] = cursor
        response = plaid("/transactions/sync", **body)
        complete = response.get("transactions_update_status", "HISTORICAL_UPDATE_COMPLETE") == "HISTORICAL_UPDATE_COMPLETE"
        next_cursor = response.get("next_cursor")
        if not next_cursor:
            raise PlaidError("PRODUCT_NOT_READY")
        for item in response.get("added", []):
            store_transaction(db, connection, item, accounts)
        for item in response.get("modified", []):
            store_transaction(db, connection, item, accounts)
        for item in response.get("removed", []):
            remove_transaction(db, connection["id"], item.get("transaction_id"))
        cursor = next_cursor
        if not response.get("has_more"):
            break
    db.execute("update keepit_private.connections set transaction_cursor=%s where id=%s",
               (cursor, connection["id"]))
    prune_transactions(db, connection["id"])
    return complete


def sync(db, connection):
    token = decrypt(connection["token_ciphertext"])
    response = plaid("/accounts/get", access_token=token)
    accounts = [{"id": a["account_id"], "label": a["name"] + (f" ••{a['mask']}" if a.get("mask") else ""),
                 "iso_currency_code": (a.get("balances") or {}).get("iso_currency_code"),
                 "unofficial_currency_code": (a.get("balances") or {}).get("unofficial_currency_code")}
                for a in response["accounts"] if a["type"] in ("credit", "depository")]
    name = connection["institution_name"]
    institution_id = response["item"].get("institution_id")
    if institution_id and not connection["institution_id"]:
        name = plaid("/institutions/get_by_id", institution_id=institution_id, country_codes=["US"])["institution"]["name"]
    db.execute("""update keepit_private.connections set accounts=%s,institution_id=%s,
        institution_name=%s where id=%s""",
        (Jsonb([{"id": a["id"], "label": a["label"]} for a in accounts]), institution_id, name, connection["id"]))
    connection["accounts"] = accounts
    account_map = {account["id"]: account for account in accounts}
    complete = sync_transactions(db, connection, token, account_map)
    transaction_complete = complete
    result = {"outflow_streams": []}
    recurring_error = None
    if complete:
        try:
            result = plaid("/transactions/recurring/get", access_token=token,
                           options={"personal_finance_category_version": "v2"})
        except PlaidError as exc:
            recurring_error = exc.code
            complete = False
    counts = reconcile(db, connection, result["outflow_streams"] if not recurring_error else None)
    db.execute("""update keepit_private.connections set sync_status=%s,
        last_synced_at=now(),error_code=%s where id=%s""",
        ("ready" if transaction_complete else "syncing", recurring_error, connection["id"]))
    if recurring_error:
        logging.warning("Recurring provider unavailable; history detection completed: %s", recurring_error)
    logging.info("Recurring classification v%s counts=%s", CLASSIFIER_VERSION, dict(counts))
    return complete


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
                complete = sync(db, connection)
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
            delay = "24 hours" if complete else f"{min(3600, 30 * 2 ** min(connection['attempts'], 7))} seconds"
            db.execute("""update keepit_private.jobs set attempts=%s,
                available_at=now()+(%s)::interval where connection_id=%s""",
                (0 if complete else connection["attempts"] + 1, delay, connection["id"]))
        return True


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    require_plaid()
    while True:
        try:
            if run_once():
                continue
        except Exception as exc:
            logging.error("Worker unavailable: %s", type(exc).__name__)
        time.sleep(5)
