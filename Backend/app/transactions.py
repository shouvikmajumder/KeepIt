"""Normalize Plaid transaction updates without retaining raw bank descriptions."""
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from .detection import identity


def _date(value):
    try:
        parsed = date.fromisoformat(str(value))
        return parsed if 2000 <= parsed.year <= 2100 else None
    except (TypeError, ValueError):
        return None


def _amount(value):
    try:
        parsed = Decimal(str(value)).quantize(Decimal("0.01"))
        return parsed if parsed.is_finite() and abs(parsed) < Decimal("100000000000") else None
    except InvalidOperation:
        return None


def _name(transaction):
    service, ambiguous = identity(transaction.get("merchant_name"), transaction.get("name"))
    if not ambiguous and " service " in service:
        return str(transaction.get("name"))[:160]
    candidates = [transaction.get("merchant_name")]
    candidates.extend(item.get("name") for item in transaction.get("counterparties") or []
                      if item.get("type") == "merchant")
    candidates.append(transaction.get("name"))
    for value in candidates:
        cleaned = " ".join(str(value or "").split())
        if cleaned:
            return cleaned[:160]
    return "Transaction"


def store_transaction(db, connection, transaction, accounts):
    transaction_id = transaction.get("transaction_id")
    transaction_date = _date(transaction.get("date"))
    amount = _amount(transaction.get("amount"))
    account_id = transaction.get("account_id")
    if not all((transaction_id, transaction_date, amount is not None, account_id)) or account_id not in accounts:
        return False
    account = accounts.get(account_id, {})
    unofficial = transaction.get("unofficial_currency_code")
    currency = transaction.get("iso_currency_code")
    if currency is None and unofficial is None:
        currency = account.get("iso_currency_code")
    if unofficial is not None:
        currency = None
    category = transaction.get("personal_finance_category") or {}
    merchant = " ".join(str(transaction.get("merchant_name") or "").split()) or None
    db.execute("""insert into keepit_private.transactions
        (connection_id,transaction_id,account_id,account_label,transaction_date,authorized_date,
         display_name,merchant_name,amount,currency,pending,pending_transaction_id,pfc_primary,
         pfc_detailed,pfc_confidence,payment_channel)
        values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        on conflict(connection_id,transaction_id) do update set
          account_id=excluded.account_id,account_label=excluded.account_label,
          transaction_date=excluded.transaction_date,authorized_date=excluded.authorized_date,
          display_name=excluded.display_name,merchant_name=excluded.merchant_name,
          amount=excluded.amount,currency=excluded.currency,pending=excluded.pending,
          pending_transaction_id=excluded.pending_transaction_id,pfc_primary=excluded.pfc_primary,
          pfc_detailed=excluded.pfc_detailed,pfc_confidence=excluded.pfc_confidence,
          payment_channel=excluded.payment_channel,updated_at=now()""",
        (connection["id"], transaction_id, account_id, account.get("label", "Account"),
         transaction_date, _date(transaction.get("authorized_date")), _name(transaction), merchant,
         amount, currency, bool(transaction.get("pending")), transaction.get("pending_transaction_id"),
         category.get("primary"), category.get("detailed"), category.get("confidence_level"),
         transaction.get("payment_channel")))
    return True


def remove_transaction(db, connection_id, transaction_id):
    if transaction_id:
        db.execute("delete from keepit_private.transactions where connection_id=%s and transaction_id=%s",
                   (connection_id, transaction_id))


def prune_transactions(db, connection_id, today=None):
    cutoff = (today or date.today()) - timedelta(days=730)
    db.execute("delete from keepit_private.transactions where connection_id=%s and transaction_date<%s",
               (connection_id, cutoff))
