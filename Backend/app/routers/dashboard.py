from decimal import Decimal
from fastapi import APIRouter, Depends
from ..auth import get_current_user_id
from ..recurrence import monthly_total
from ..schemas import SubscriptionOut
from .subscriptions import list_subscriptions
from ..postgres import transaction
from .expenses import CATEGORY_LABELS, EXCLUDED_PRIMARY, label, month_bounds

router = APIRouter()


def money(value):
    return str(Decimal(value).quantize(Decimal("0.01")))


@router.get("/dashboard")
def dashboard(month: str = None, account_id: str = None,
              user_id: str = Depends(get_current_user_id)):
    start, end, previous = month_bounds(month)
    account_clause = " and t.account_id=%s" if account_id else ""
    exclusions = list(EXCLUDED_PRIMARY)
    with transaction() as db:
        values = [user_id, start, end, exclusions]
        if account_id:
            values.append(account_id)
        current = db.execute(f"""select coalesce(sum(t.amount),0) as total
            from keepit_private.transactions t join keepit_private.connections c on c.id=t.connection_id
            where c.user_id=%s and t.transaction_date>=%s and t.transaction_date<%s
            and not t.pending and not t.hidden and t.currency='USD'
            and coalesce(t.pfc_primary,'') <> all(%s) and t.amount<>0{account_clause}""", values).fetchone()["total"]
        values = [user_id, previous, start, exclusions]
        if account_id:
            values.append(account_id)
        prior = db.execute(f"""select coalesce(sum(t.amount),0) as total
            from keepit_private.transactions t join keepit_private.connections c on c.id=t.connection_id
            where c.user_id=%s and t.transaction_date>=%s and t.transaction_date<%s
            and not t.pending and not t.hidden and t.currency='USD'
            and coalesce(t.pfc_primary,'') <> all(%s) and t.amount<>0{account_clause}""", values).fetchone()["total"]
        values = [user_id, start, end, exclusions]
        if account_id:
            values.append(account_id)
        categories = db.execute(f"""select t.pfc_primary,coalesce(sum(t.amount),0) as total
            from keepit_private.transactions t join keepit_private.connections c on c.id=t.connection_id
            where c.user_id=%s and t.transaction_date>=%s and t.transaction_date<%s
            and not t.pending and not t.hidden and t.currency='USD'
            and coalesce(t.pfc_primary,'') <> all(%s) and t.amount<>0{account_clause}
            group by t.pfc_primary order by total desc""", values).fetchall()
        connections = db.execute("""select accounts,last_synced_at,sync_status from keepit_private.connections
            where user_id=%s order by created_at""", (user_id,)).fetchall()
    rows = list_subscriptions(user_id, start)
    active = [row for row in rows if row["status"] == "active" and not row["hidden"]]
    subscriptions = [row for row in active if row["payment_type"] == "subscription"]
    bills = [row for row in active if row["payment_type"] == "bill"]
    combined = {}
    for row in categories:
        key = row["pfc_primary"] if row["pfc_primary"] in CATEGORY_LABELS else "OTHER"
        combined[key] = combined.get(key, Decimal("0")) + Decimal(row["total"])
    category_rows = [{"key": key, "label": label(key), "amount": money(amount)}
                     for key, amount in sorted(combined.items(), key=lambda item: item[1], reverse=True)]
    account_map = {account["id"]: account for connection in connections for account in connection["accounts"]}
    accounts = list(account_map.values())
    synced = [row["last_synced_at"] for row in connections if row["last_synced_at"]]
    return {"month": start.strftime("%Y-%m"), "spending_total": money(current),
            "previous_month_total": money(prior), "change_amount": money(Decimal(current) - Decimal(prior)),
            "currency": "USD", "categories": category_rows,
            "subscription_monthly_estimate": str(monthly_total(subscriptions)),
            "bill_monthly_estimate": str(monthly_total(bills)),
            "upcoming": [SubscriptionOut.model_validate(row).model_dump(mode="json") for row in active[:5]],
            "accounts": accounts, "last_synced_at": max(synced).isoformat() if synced else None,
            "syncing": any(row["sync_status"] == "syncing" for row in connections)}
