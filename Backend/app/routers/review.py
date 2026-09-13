from datetime import date
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ValidationError
from psycopg.types.json import Jsonb
from ..auth import get_current_user_id
from ..postgres import transaction, owned_connection
from ..schemas import SubscriptionCreate, SubscriptionOut
from ..recurrence import project

router = APIRouter()


class Review(BaseModel):
    action: Literal["confirm", "ignore", "match"]
    subscription_id: UUID | None = None
    next_renewal_date: date | None = None
    payment_type: Literal["subscription", "bill"] | None = None


def result(db, decision, sub_id, user_id):
    row = db.execute("select * from public.subscriptions where id=%s and user_id=%s",
                     (sub_id, user_id)).fetchone() if sub_id else None
    return {"subscription_id": sub_id, "decision": decision,
            "subscription": SubscriptionOut.model_validate(project(row, date.today())).model_dump(mode="json") if row else None}


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
            return result(db, "confirmed", candidate["subscription_id"], user_id)
        if candidate["decision"] == "ignored":
            return result(db, "ignored", None, user_id)
        if body.action == "ignore":
            if candidate["subscription_id"]:
                db.execute("delete from public.subscriptions where id=%s and user_id=%s",
                           (candidate["subscription_id"], user_id))
            db.execute("update keepit_private.candidates set decision='ignored' where id=%s", (candidate_id,))
            return result(db, "ignored", None, user_id)
        data = candidate["observation"]
        if not data["eligible"] or data.get("confidence") == "excluded":
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
                         ("name", "cost", "billing_interval", "next_renewal_date", "recurrence_anchor", "payment_type")}
            db.execute("""update public.subscriptions set source='plaid',status='active',connection_id=%s,
                candidate_id=%s,provider_observation=%s,user_overrides=%s where id=%s and user_id=%s""",
                (found["connection_id"], candidate_id, Jsonb(data), Jsonb(overrides), sub_id, user_id))
        else:
            existing = db.execute("select * from public.subscriptions where id=%s and user_id=%s for update",
                                  (candidate["subscription_id"], user_id)).fetchone() if candidate["subscription_id"] else None
            overrides = dict(existing["user_overrides"] or {}) if existing else {}
            if body.payment_type:
                overrides["payment_type"] = body.payment_type
            if body.next_renewal_date:
                overrides["next_renewal_date"] = body.next_renewal_date.isoformat()
                overrides["recurrence_anchor"] = body.next_renewal_date.isoformat()
            payment_type = overrides.get("payment_type", data.get("payment_type", "unknown"))
            if payment_type not in ("subscription", "bill"):
                raise HTTPException(422, "Choose Subscription or Bill before keeping this payment.")
            # Keeping a type is an explicit decision, even if it agrees with the suggestion.
            overrides["payment_type"] = payment_type
            try:
                form = SubscriptionCreate(name=overrides.get("name", data["name"]),
                    cost=overrides.get("cost", data["cost"]), currency=data["currency"], payment_type=payment_type,
                    billing_interval=overrides.get("billing_interval", data["billing_interval"]),
                    next_renewal_date=overrides.get("next_renewal_date", data["next_renewal_date"]))
            except ValidationError:
                raise HTTPException(422, "Choose a valid next renewal date before adding.") from None
            if existing:
                sub_id = existing["id"]
                db.execute("""update public.subscriptions set status='active', name=%s,cost=%s,
                    billing_interval=%s,next_renewal_date=%s,recurrence_anchor=%s,payment_type=%s,
                    provider_observation=%s,user_overrides=%s where id=%s and user_id=%s""",
                    (form.name, form.cost, form.billing_interval, form.next_renewal_date,
                     overrides.get("recurrence_anchor", form.next_renewal_date), form.payment_type,
                     Jsonb(data), Jsonb(overrides), sub_id, user_id))
            else:
                sub_id = db.execute("""insert into public.subscriptions
                    (user_id,name,cost,next_renewal_date,recurrence_anchor,billing_interval,source,
                     connection_id,candidate_id,provider_observation,user_overrides,payment_type)
                    values (%s,%s,%s,%s,%s,%s,'plaid',%s,%s,%s,%s,%s) returning id""",
                    (user_id, form.name, form.cost, form.next_renewal_date, form.next_renewal_date,
                     form.billing_interval, found["connection_id"], candidate_id, Jsonb(data), Jsonb(overrides), form.payment_type)).fetchone()["id"]
        db.execute("update keepit_private.candidates set decision='confirmed',subscription_id=%s where id=%s",
                   (sub_id, candidate_id))
        return result(db, "confirmed", sub_id, user_id)
