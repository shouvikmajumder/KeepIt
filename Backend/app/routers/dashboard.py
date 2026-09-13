from datetime import date
from fastapi import APIRouter, Depends
from ..auth import get_current_user_id
from ..recurrence import monthly_total
from .subscriptions import list_subscriptions
from .connections import candidates

router = APIRouter()


@router.get("/dashboard")
def dashboard(today: date = None, user_id: str = Depends(get_current_user_id)):
    # The browser sends its local calendar day; no timestamp-to-date conversion.
    rows = list_subscriptions(user_id, today)
    active = [row for row in rows if row["status"] == "active"]
    return {"monthly_equivalent": str(monthly_total(active)), "active_count": len(active),
            "pending_review_count": sum(candidate["decision"] == "pending"
                and candidate["observation"].get("eligible", False)
                and candidate["observation"].get("confidence") != "excluded"
                for candidate in candidates(user_id)),
            "currency": "USD", "upcoming": active[:5]}
