"""Combine provider and history evidence without duplicating subscription rows."""
from collections import Counter
from datetime import date

from .detection import local_streams, expired
from .discovery import store_stream


def adopt(db, connection_id, stream):
    ids = [row["id"] for row in stream["_history"] if row.get("id")]
    target = db.execute("select * from keepit_private.candidates where connection_id=%s and stream_id=%s",
                        (connection_id, stream["stream_id"])).fetchone()
    overlaps = db.execute("""select distinct c.* from keepit_private.candidates c
        join keepit_private.candidate_transactions m on m.candidate_id=c.id
        where c.connection_id=%s and m.transaction_id=any(%s::uuid[]) order by c.id""",
        (connection_id, ids)).fetchall() if ids else []
    # During a recurring-provider outage retain the last provider observation.
    if stream.get("_source") == "history" and any(row["source"] == "plaid" for row in overlaps):
        return False
    for old in overlaps:
        if target and old["id"] == target["id"]:
            continue
        if not target:
            db.execute("""update keepit_private.candidates set stream_id=%s,source=%s,detection_key=%s
                where id=%s""", (stream["stream_id"], stream.get("_source", "plaid"), stream["stream_id"], old["id"]))
            target = old
            continue
        if old["decision"] == "ignored":
            db.execute("update keepit_private.candidates set decision='ignored' where id=%s", (target["id"],))
        if old["subscription_id"] and not target["subscription_id"]:
            db.execute("update public.subscriptions set candidate_id=%s where id=%s",
                       (target["id"], old["subscription_id"]))
            db.execute("update keepit_private.candidates set subscription_id=%s,decision=%s where id=%s",
                       (old["subscription_id"], "ignored" if "ignored" in (old["decision"], target["decision"]) else "confirmed", target["id"]))
            target["subscription_id"] = old["subscription_id"]
        elif old["subscription_id"] and old["subscription_id"] != target["subscription_id"]:
            # Keep prior records recoverable, but only one automatic result active.
            db.execute("""update public.subscriptions set hidden=true where id=%s and
                exists(select 1 from public.subscriptions where id=%s and hidden)""",
                (target["subscription_id"], old["subscription_id"]))
            db.execute("update public.subscriptions set status='inactive' where id=%s and auto_detected",
                       (old["subscription_id"],))
        db.execute("""insert into keepit_private.candidate_transactions(candidate_id,transaction_id)
            select %s,transaction_id from keepit_private.candidate_transactions where candidate_id=%s
            on conflict do nothing""", (target["id"], old["id"]))
        db.execute("delete from keepit_private.candidates where id=%s", (old["id"],))
    return True


def reconcile(db, connection, provider_streams, today=None):
    today = today or date.today()
    rows = db.execute("""select * from keepit_private.transactions where connection_id=%s
        and not pending and currency='USD' and amount>0 order by transaction_date,transaction_id""",
        (connection["id"],)).fetchall()
    by_id = {row["transaction_id"]: row for row in rows}
    claimed = set()
    counts = Counter()
    for original in provider_streams or []:
        stream = dict(original)
        stream["_history"] = [by_id[tid] for tid in set(stream.get("transaction_ids") or [])
                              if tid in by_id and by_id[tid]["account_id"] == stream.get("account_id")]
        stream["_today"] = today
        claimed.update(row["transaction_id"] for row in stream["_history"])
        adopt(db, connection["id"], stream)
        data = store_stream(db, connection, stream)
        counts[(data["payment_type"], data["confidence"])] += 1
    # Group before excluding claimed rows: do not manufacture a stable pattern
    # from an arbitrary subset of an otherwise irregular merchant history.
    for stream in local_streams(rows, today):
        if claimed.intersection(stream["transaction_ids"]):
            continue
        if adopt(db, connection["id"], stream):
            data = store_stream(db, connection, stream)
            counts[(data["payment_type"], data["confidence"])] += 1
    for row in db.execute("""select id,provider_observation from public.subscriptions
        where connection_id=%s and auto_detected and status='active'
        and not (user_overrides ? 'status')""", (connection["id"],)).fetchall():
        observed = row["provider_observation"] or {}
        # Missing metadata is not cancellation evidence for legacy records.
        if observed.get("last_payment_date") and expired(observed["last_payment_date"],
                observed.get("provider_frequency"), today):
            db.execute("update public.subscriptions set status='inactive' where id=%s", (row["id"],))
    return counts
