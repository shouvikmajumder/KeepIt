from datetime import date
from fastapi import APIRouter, Depends
from ..auth import get_current_user_id
from ..recurrence import monthly_total
from .subscriptions import list_subscriptions

router = APIRouter()


@router.get("/dashboard")
def dashboard(today: date = None, user_id: str = Depends(get_current_user_id)):
    # The browser sends its local calendar day; no timestamp-to-date conversion.
    rows = list_subscriptions(user_id, today)
    active = [row for row in rows if row["status"] == "active"]
    return {"monthly_equivalent": str(monthly_total(active)), "active_count": len(active),
            "currency": "USD", "upcoming": active[:5]}
