from datetime import date
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ValidationError
from psycopg.types.json import Jsonb
from ..auth import get_current_user_id
from ..postgres import transaction, owned_connection
from ..schemas import SubscriptionCreate

router = APIRouter()


class Review(BaseModel):
    action: Literal["confirm", "ignore", "match"]
    subscription_id: UUID | None = None
    next_renewal_date: date | None = None


@router.post("/subscription-candidates/{candidate_id}/review")
def review(candidate_id: UUID, body: Review, user_id: str = Depends(get_current_user_id)):
    with transaction() as db:
        found = db.execute("""select d.connection_id from keepit_private.candidates d
            join keepit_private.connections c on c.id=d.connection_id where d.id=%s and c.user_id=%s""",
            (candidate_id, user_id)).fetchone()
        if not found:
            raise HTTPException(404, "Discovery not found")
        owned_connection(db, found["connection_id"], user_id)
        candidate = db.execute("select * from keepit_private.candidates where id=%s for update", (candidate_id,)).fetchone()
        # The lock plus saved decision makes double taps and retries harmless.
        if candidate["decision"] == "confirmed":
            return {"subscription_id": candidate["subscription_id"], "decision": "confirmed"}
        if body.action == "ignore":
            if candidate["subscription_id"]:
                db.execute("delete from public.subscriptions where id=%s and user_id=%s",
                           (candidate["subscription_id"], user_id))
            db.execute("update keepit_private.candidates set decision='ignored' where id=%s", (candidate_id,))
            return {"decision": "ignored", "subscription_id": None}
        data = candidate["observation"]
        if not data["eligible"]:
            raise HTTPException(422, data["reason"])
        if body.action == "match":
            existing = db.execute("""select * from public.subscriptions
                where id=%s and user_id=%s and source='manual' and candidate_id is null for update""",
                (body.subscription_id, user_id)).fetchone()
            if not existing:
                raise HTTPException(404, "Choose an existing manual subscription")
            if candidate["subscription_id"] and candidate["subscription_id"] != existing["id"]:
                db.execute("delete from public.subscriptions where id=%s and user_id=%s",
                           (candidate["subscription_id"], user_id))
            sub_id = existing["id"]
            # Matching keeps the manual values the user already chose.
            overrides = {key: str(existing[key]) for key in
                         ("name", "cost", "billing_interval", "next_renewal_date", "recurrence_anchor")}
            db.execute("""update public.subscriptions set source='plaid',status='active',connection_id=%s,
                candidate_id=%s,provider_observation=%s,user_overrides=%s where id=%s and user_id=%s""",
                (found["connection_id"], candidate_id, Jsonb(data), Jsonb(overrides), sub_id, user_id))
        elif candidate["subscription_id"]:
            sub_id = candidate["subscription_id"]
            db.execute("""update public.subscriptions set status='active', provider_observation=%s
                where id=%s and user_id=%s""", (Jsonb(data), sub_id, user_id))
        else:
            try:
                form = SubscriptionCreate(name=data["name"], cost=data["cost"], currency=data["currency"],
                    billing_interval=data["billing_interval"],
                    next_renewal_date=body.next_renewal_date or data["next_renewal_date"])
            except ValidationError:
                raise HTTPException(422, "Choose a valid next renewal date before adding.") from None
            overrides = {"next_renewal_date": form.next_renewal_date.isoformat()} if body.next_renewal_date else {}
            sub_id = db.execute("""insert into public.subscriptions
                (user_id,name,cost,next_renewal_date,recurrence_anchor,billing_interval,source,
                 connection_id,candidate_id,provider_observation,user_overrides)
                values (%s,%s,%s,%s,%s,%s,'plaid',%s,%s,%s,%s) returning id""",
                (user_id, form.name, form.cost, form.next_renewal_date, form.next_renewal_date,
                 form.billing_interval, found["connection_id"], candidate_id, Jsonb(data), Jsonb(overrides))).fetchone()["id"]
        db.execute("update keepit_private.candidates set decision='confirmed',subscription_id=%s where id=%s",
                   (sub_id, candidate_id))
        return {"decision": "confirmed", "subscription_id": sub_id}
