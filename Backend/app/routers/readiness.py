from fastapi import APIRouter
from fastapi.responses import JSONResponse
from ..postgres import transaction

router = APIRouter()


@router.get("/ready")
def ready():
    try:
        with transaction() as db:
            db.execute("select billing_interval,recurrence_anchor,payment_type from public.subscriptions limit 0")
            db.execute("select connection_id from keepit_private.jobs limit 0")
    except Exception:
        return JSONResponse(status_code=503, content={"status": "not_ready"})
    return {"status": "ready"}
