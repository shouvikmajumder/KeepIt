from uuid import UUID
from fastapi import APIRouter, Depends
from ..auth import get_current_user_id
from ..plaid_client import plaid, decrypt, PlaidError
from ..postgres import transaction, owned_connection

router = APIRouter(tags=["connections"])


@router.get("/connections")
def connections(user_id: str = Depends(get_current_user_id)):
    with transaction() as db:
        return db.execute("""select id,institution_name,accounts,sync_status,last_synced_at
            from keepit_private.connections where user_id=%s order by created_at""", (user_id,)).fetchall()


def disconnect(db, connection_id, user_id):
    connection = owned_connection(db, connection_id, user_id)
    try:
        plaid("/item/remove", access_token=decrypt(connection["token_ciphertext"]))
    except PlaidError as exc:
        if exc.code not in ("ITEM_NOT_FOUND", "INVALID_ACCESS_TOKEN"):
            raise
    # Provisional discoveries disappear with the connection. Confirmed tracking
    # records remain, but no longer receive provider updates.
    db.execute("""delete from public.subscriptions where connection_id=%s and user_id=%s
        and status='pending_review'""", (connection_id, user_id))
    db.execute("""update public.subscriptions set source='manual',connection_id=null,
        candidate_id=null,provider_observation='{}',user_overrides='{}'
        where connection_id=%s and user_id=%s""", (connection_id, user_id))
    db.execute("delete from keepit_private.connections where id=%s and user_id=%s", (connection_id, user_id))


@router.delete("/connections/{connection_id}", status_code=204)
def remove_connection(connection_id: UUID, user_id: str = Depends(get_current_user_id)):
    with transaction() as db:
        disconnect(db, connection_id, user_id)
