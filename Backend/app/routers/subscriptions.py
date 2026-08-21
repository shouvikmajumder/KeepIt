"""Subscription endpoints — the backend equivalent of src/lib/subscriptions.ts.

Every handler depends on `get_current_user_id`, so it only runs for a request
carrying a valid token. Because the service_role client bypasses RLS, each
query is explicitly scoped to that user_id — that's what keeps one user from
ever seeing or touching another's rows.

The handlers are plain `def` (not `async def`): supabase-py is synchronous, so
FastAPI runs these in a threadpool and the event loop is never blocked.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import get_current_user_id
from ..db import get_supabase
from ..schemas import SubscriptionCreate, SubscriptionOut

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

# The columns the app reads back — kept in one place to match SubscriptionOut.
_COLUMNS = "id, name, cost, next_renewal_date, created_at"


@router.get("", response_model=list[SubscriptionOut])
def list_subscriptions(user_id: str = Depends(get_current_user_id)):
    """This user's subscriptions, soonest renewal first."""
    res = (
        get_supabase()
        .table("subscriptions")
        .select(_COLUMNS)
        .eq("user_id", user_id)
        .order("next_renewal_date")
        .execute()
    )
    return res.data


@router.post("", response_model=SubscriptionOut, status_code=status.HTTP_201_CREATED)
def create_subscription(
    body: SubscriptionCreate, user_id: str = Depends(get_current_user_id)
):
    """Insert a subscription for this user and return the created row."""
    payload = {
        "name": body.name,
        "cost": body.cost,
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
def delete_subscription(sub_id: str, user_id: str = Depends(get_current_user_id)):
    """Delete one of this user's subscriptions. The user_id filter means a
    caller can't delete a row that isn't theirs (it simply matches nothing)."""
    get_supabase().table("subscriptions").delete().eq("id", sub_id).eq(
        "user_id", user_id
    ).execute()
    return None
