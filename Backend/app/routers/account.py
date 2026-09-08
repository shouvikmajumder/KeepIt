from fastapi import APIRouter, Depends, HTTPException
from ..auth import get_current_user_id
from ..config import settings
from ..db import get_supabase
from ..postgres import transaction
from .connections import disconnect

router = APIRouter()


def delete_auth_user(user_id):
    try:
        get_supabase().auth.admin.delete_user(user_id)
    except Exception:
        raise HTTPException(503, "Account deletion did not finish. Please retry.") from None


@router.delete("/account", status_code=204)
def delete_account(user_id: str = Depends(get_current_user_id)):
    if not settings.database_url:
        delete_auth_user(user_id)
        return
    with transaction() as db:
        # A session lock survives commits and prevents new bank links during deletion.
        # Closing this database connection always releases the lock, including errors.
        db.execute("select pg_advisory_lock(hashtextextended(%s, 0))", (user_id,))
        rows = db.execute("select id from keepit_private.connections where user_id=%s order by id", (user_id,)).fetchall()
        for row in rows:
            disconnect(db, row["id"], user_id)
            db.commit()  # Completed revocations stay completed if a later one fails.
        db.commit()
        # Supabase cascades owned rows. No row locks remain to block that cascade.
        delete_auth_user(user_id)
