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
from psycopg import sql
from psycopg.types.json import Jsonb
from ..postgres import transaction
from ..schemas import SubscriptionCreate, SubscriptionOut, SubscriptionUpdate
from ..recurrence import project

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

# The columns the app reads back — kept in one place to match SubscriptionOut.
_COLUMNS = "id,name,cost,next_renewal_date,created_at,billing_interval,currency,status,source,recurrence_anchor"


@router.get("", response_model=list[SubscriptionOut])
def list_subscriptions(user_id: str = Depends(get_current_user_id), today: date = None):
    """This user's subscriptions, soonest renewal first."""
    with transaction() as db:
        records = db.execute(f"select {_COLUMNS} from public.subscriptions where user_id=%s", (user_id,)).fetchall()
    rows = [project(row, today or date.today()) for row in records]
    return sorted(rows, key=lambda row: (row["status"] != "active", row["next_renewal_date"]))


@router.post("", response_model=SubscriptionOut, status_code=status.HTTP_201_CREATED)
def create_subscription(
    body: SubscriptionCreate, user_id: str = Depends(get_current_user_id)
):
    """Insert a subscription for this user and return the created row."""
    with transaction() as db:
        # Owner comes from the verified session, never the request body.
        return db.execute(f"""insert into public.subscriptions
            (user_id,name,cost,billing_interval,currency,recurrence_anchor,next_renewal_date)
            values (%s,%s,%s,%s,%s,%s,%s) returning {_COLUMNS}""",
            (user_id, body.name, body.cost, body.billing_interval, body.currency,
             body.next_renewal_date, body.next_renewal_date)).fetchone()



@router.delete("/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subscription(sub_id: UUID, user_id: str = Depends(get_current_user_id)):
    """Delete one of this user's subscriptions. The user_id filter means a
    caller can't delete a row that isn't theirs (it simply matches nothing)."""
    with transaction() as db:
        connection = db.execute("select connection_id from public.subscriptions where id=%s and user_id=%s", (sub_id, user_id)).fetchone()
        if connection and connection["connection_id"]:
            # Match the worker's lock order before deleting its linked candidate reference.
            db.execute("select id from keepit_private.connections where id=%s for update", (connection["connection_id"],))
        db.execute("delete from public.subscriptions where id=%s and user_id=%s", (sub_id, user_id))
    return None


@router.patch("/{sub_id}", response_model=SubscriptionOut)
def update_subscription(sub_id: UUID, body: SubscriptionUpdate,
                        user_id: str = Depends(get_current_user_id), today: date = None):
    with transaction() as db:
        previous = db.execute("select * from public.subscriptions where id=%s and user_id=%s for update",
                              (sub_id, user_id)).fetchone()
        if not previous:
            raise HTTPException(404, "Subscription not found")
        payload = body.model_dump(mode="json")
        # Locking prevents a provider refresh from overwriting edits mid-save.
        current = project(previous, today or date.today())
        if (payload["next_renewal_date"] != str(current["next_renewal_date"])
                or payload["billing_interval"] != current["billing_interval"]):
            payload["recurrence_anchor"] = payload["next_renewal_date"]
        if previous["source"] == "plaid":
            overrides = previous.get("user_overrides") or {}
            for key, value in payload.items():
                if str(value) != str(current.get(key)):
                    overrides[key] = value
            payload["user_overrides"] = Jsonb(overrides)
        assignments = sql.SQL(",").join(sql.SQL("{}=%s").format(sql.Identifier(key)) for key in payload)
        query = sql.SQL("update public.subscriptions set {} where id=%s and user_id=%s returning *").format(assignments)
        result = db.execute(query, (*payload.values(), sub_id, user_id)).fetchone()
        return project(result, today or date.today())
