"""Reduce provider data to the fields needed for subscription review."""
from decimal import Decimal, InvalidOperation
from psycopg.types.json import Jsonb
from pydantic import ValidationError
from .schemas import SubscriptionCreate


def observation(stream: dict, accounts: list[dict]) -> dict:
    amount = stream.get("last_amount") or {}
    interval = {"MONTHLY": "monthly", "ANNUALLY": "annual"}.get(stream.get("frequency"))
    account = next((a for a in accounts if a["id"] == stream.get("account_id")), {})
    currency = amount.get("iso_currency_code")
    unofficial_currency = amount.get("unofficial_currency_code")
    # Use only the matching account's currency when the payment supplies neither.
    # Explicit foreign or unofficial currencies must never become USD by fallback.
    if currency is None and unofficial_currency is None:
        currency = account.get("iso_currency_code")
        unofficial_currency = account.get("unofficial_currency_code")
    try:
        cost = Decimal(str(amount.get("amount", "0")))
        valid_cost = cost.is_finite() and 0 < cost < Decimal("100000000")
    except InvalidOperation:
        valid_cost, cost = False, Decimal("0")
    reason = None
    if not account:
        reason = "This account is not selected."
    elif not stream.get("is_active"):
        reason = "This recurring payment is no longer active."
    elif currency is None and unofficial_currency is None:
        reason = "Payment currency is unavailable."
    elif currency != "USD" or unofficial_currency is not None:
        reason = "Only USD subscriptions are supported."
    elif not interval:
        reason = "Only monthly and annual billing are supported."
    elif not valid_cost:
        reason = "A positive subscription amount is required."
    return {"name": (stream.get("merchant_name") or stream.get("description") or "Recurring payment")[:120],
            "cost": str(cost.quantize(Decimal("0.01"))) if valid_cost else "0.00",
            "billing_interval": interval, "currency": currency,
            "next_renewal_date": stream.get("predicted_next_date"),
            "last_payment_date": stream.get("last_date"), "account_label": account.get("label", "Account"),
            "eligible": reason is None, "reason": reason}


def store_stream(db, connection: dict, stream: dict):
    data = observation(stream, connection["accounts"])
    candidate = db.execute("""insert into keepit_private.candidates(connection_id,stream_id,observation)
        values (%s,%s,%s) on conflict(connection_id,stream_id) do update
        set observation=excluded.observation returning id,decision,subscription_id""",
        (connection["id"], stream["stream_id"], Jsonb(data))).fetchone()
    if not candidate["subscription_id"]:
        # A stream is provisional until the user confirms it. Ignored streams
        # intentionally remain candidate-only so later syncs never recreate
        # them without the user's involvement.
        if candidate["decision"] != "pending" or not data["eligible"]:
            return
        try:
            form = SubscriptionCreate(name=data["name"], cost=data["cost"], currency=data["currency"],
                billing_interval=data["billing_interval"], next_renewal_date=data["next_renewal_date"])
        except ValidationError:
            return
        sub_id = db.execute("""insert into public.subscriptions
            (user_id,name,cost,next_renewal_date,recurrence_anchor,billing_interval,status,source,
             connection_id,candidate_id,provider_observation)
            values (%s,%s,%s,%s,%s,%s,'pending_review','plaid',%s,%s,%s) returning id""",
            (connection["user_id"], form.name, form.cost, form.next_renewal_date,
             form.next_renewal_date, form.billing_interval, connection["id"], candidate["id"], Jsonb(data))).fetchone()["id"]
        db.execute("update keepit_private.candidates set subscription_id=%s where id=%s", (sub_id, candidate["id"]))
        return
    # Observation updates are separate from overrides, so refreshes respect edits.
    db.execute("update public.subscriptions set provider_observation=%s where id=%s and user_id=%s",
               (Jsonb(data), candidate["subscription_id"], connection["user_id"]))
    if not data["eligible"]:
        return
    db.execute("""update public.subscriptions set
        name=coalesce(user_overrides->>'name', %s),
        cost=coalesce(user_overrides->>'cost', %s)::numeric,
        billing_interval=coalesce(user_overrides->>'billing_interval', %s),
        next_renewal_date=coalesce(user_overrides->>'next_renewal_date', %s, next_renewal_date::text)::date,
        recurrence_anchor=coalesce(user_overrides->>'recurrence_anchor',
          user_overrides->>'next_renewal_date', %s, recurrence_anchor::text)::date
        where id=%s and user_id=%s""", (data["name"], data["cost"], data["billing_interval"],
        data["next_renewal_date"], data["next_renewal_date"], candidate["subscription_id"], connection["user_id"]))
