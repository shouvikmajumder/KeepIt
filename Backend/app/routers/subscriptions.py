"""Subscription endpoints — the backend equivalent of src/lib/subscriptions.ts.

Every handler depends on `get_current_user_id`, so it only runs for a request
carrying a valid token. Because the service_role client bypasses RLS, each
query is explicitly scoped to that user_id — that's what keeps one user from
ever seeing or touching another's rows.

The handlers are plain `def` (not `async def`): supabase-py is synchronous, so
FastAPI runs these in a threadpool and the event loop is never blocked.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from datetime import date
from uuid import UUID

from ..auth import get_current_user_id
from ..db import get_supabase
from ..schemas import SubscriptionCreate, SubscriptionOut, SubscriptionUpdate
from ..recurrence import project

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

# The columns the app reads back — kept in one place to match SubscriptionOut.
_COLUMNS = "id,name,cost,next_renewal_date,created_at,billing_interval,currency,status,source,recurrence_anchor"


@router.get("", response_model=list[SubscriptionOut])
def list_subscriptions(user_id: str = Depends(get_current_user_id), today: date = None):
    """This user's subscriptions, soonest renewal first."""
    res = (
        get_supabase()
        .table("subscriptions")
        .select(_COLUMNS)
        .eq("user_id", user_id)
        .order("next_renewal_date")
        .execute()
    )
    rows = [project(row, today or date.today()) for row in res.data]
    return sorted(rows, key=lambda row: (row["status"] != "active", row["next_renewal_date"]))


@router.post("", response_model=SubscriptionOut, status_code=status.HTTP_201_CREATED)
def create_subscription(
    body: SubscriptionCreate, user_id: str = Depends(get_current_user_id)
):
    """Insert a subscription for this user and return the created row."""
    payload = {
        "name": body.name,
        "cost": str(body.cost),
        "billing_interval": body.billing_interval,
        "currency": body.currency,
        "recurrence_anchor": body.next_renewal_date.isoformat(),
        # date -> "YYYY-MM-DD" string for JSON transport.
        "next_renewal_date": body.next_renewal_date.isoformat(),
        # Stamp the owner ourselves — never trust a user_id from the client.
        "user_id": user_id,
    }
    res = get_supabase().table("subscriptions").insert(payload).execute()
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Insert failed")
    return res.data[0]


@router.delete("/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subscription(sub_id: UUID, user_id: str = Depends(get_current_user_id)):
    """Delete one of this user's subscriptions. The user_id filter means a
    caller can't delete a row that isn't theirs (it simply matches nothing)."""
    get_supabase().table("subscriptions").delete().eq("id", str(sub_id)).eq(
        "user_id", user_id
    ).execute()
    return None


@router.patch("/{sub_id}", response_model=SubscriptionOut)
def update_subscription(sub_id: UUID, body: SubscriptionUpdate,
                        user_id: str = Depends(get_current_user_id)):
    table = get_supabase().table("subscriptions")
    rows = table.select("*").eq("id", str(sub_id)).eq("user_id", user_id).execute().data
    if not rows:
        raise HTTPException(404, "Subscription not found")
    previous = rows[0]
    payload = body.model_dump(mode="json")
    # Unchanged projected dates must not replace Jan 31's original anchor with Feb 28.
    current = project(previous, date.today())
    if payload["next_renewal_date"] != current["next_renewal_date"]:
        payload["recurrence_anchor"] = payload["next_renewal_date"]
    if previous["source"] == "plaid":
        overrides = previous.get("user_overrides") or {}
        for key, value in payload.items():
            if str(value) != str(current.get(key)):
                overrides[key] = value
        payload["user_overrides"] = overrides
    result = table.update(payload).eq("id", str(sub_id)).eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(404, "Subscription not found")
    return project(result.data[0], date.today())
