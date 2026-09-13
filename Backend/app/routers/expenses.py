import base64
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict

from ..auth import get_current_user_id
from ..postgres import transaction

router = APIRouter(prefix="/expenses", tags=["expenses"])

EXCLUDED_PRIMARY = ("INCOME", "TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS", "LOAN_DISBURSEMENTS")
CATEGORY_LABELS = {
    "BANK_FEES": "Bank fees", "ENTERTAINMENT": "Entertainment", "FOOD_AND_DRINK": "Food & drink",
    "GENERAL_MERCHANDISE": "Shopping", "GENERAL_SERVICES": "Services", "GOVERNMENT_AND_NON_PROFIT": "Government & giving",
    "MEDICAL": "Medical", "PERSONAL_CARE": "Personal care", "RENT_AND_UTILITIES": "Housing & utilities",
    "TRANSPORTATION": "Transport", "TRAVEL": "Travel",
}


class ExpenseVisibility(BaseModel):
    model_config = ConfigDict(extra="forbid")
    hidden: bool


def month_bounds(value: str | None):
    if value is None:
        current = date.today().replace(day=1)
    else:
        try:
            current = date.fromisoformat(f"{value}-01")
        except ValueError:
            raise HTTPException(422, "Use a month in YYYY-MM format") from None
        if current.strftime("%Y-%m") != value or not 2000 <= current.year <= 2100:
            raise HTTPException(422, "Use a month in YYYY-MM format")
    following = date(current.year + (current.month == 12), current.month % 12 + 1, 1)
    previous = date(current.year - (current.month == 1), (current.month - 2) % 12 + 1, 1)
    return current, following, previous


def label(primary):
    return CATEGORY_LABELS.get(primary, "Other")


def encoded_cursor(row):
    raw = f"{row['transaction_date'].isoformat()}|{row['id']}".encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decoded_cursor(value):
    try:
        raw = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)).decode()
        day, row_id = raw.split("|", 1)
        return date.fromisoformat(day), UUID(row_id)
    except (ValueError, UnicodeError):
        raise HTTPException(422, "Invalid expense cursor") from None


def expense_row(row):
    return {
        "id": str(row["id"]), "date": row["transaction_date"].isoformat(),
        "merchant": row["display_name"], "amount": str(row["amount"]),
        "currency": row["currency"], "pending": row["pending"], "hidden": row["hidden"],
        "category": row["pfc_primary"] or "OTHER", "category_label": label(row["pfc_primary"]),
        "account_id": row["account_id"], "account_label": row["account_label"],
    }


@router.get("")
def expenses(month: str | None = None, account_id: str | None = None,
             category: str | None = None, visibility: str = "visible", cursor: str | None = None,
             limit: int = Query(50, ge=1, le=100), user_id: str = Depends(get_current_user_id)):
    start, end, _ = month_bounds(month)
    if visibility not in ("visible", "hidden"):
        raise HTTPException(422, "Visibility must be visible or hidden")
    conditions = ["c.user_id=%s", "t.transaction_date>=%s", "t.transaction_date<%s",
                  "coalesce(t.pfc_primary,'') <> all(%s)", "t.amount<>0", "t.currency='USD'", "t.hidden=%s"]
    values = [user_id, start, end, list(EXCLUDED_PRIMARY), visibility == "hidden"]
    if account_id:
        conditions.append("t.account_id=%s")
        values.append(account_id)
    if category:
        if category == "OTHER":
            conditions.append("(t.pfc_primary is null or not (t.pfc_primary = any(%s)))")
            values.append(list(CATEGORY_LABELS))
        else:
            conditions.append("t.pfc_primary=%s")
            values.append(category)
    if cursor:
        cursor_date, cursor_id = decoded_cursor(cursor)
        conditions.append("(t.transaction_date,t.id)<(%s,%s)")
        values.extend((cursor_date, cursor_id))
    with transaction() as db:
        rows = db.execute(f"""select t.* from keepit_private.transactions t
            join keepit_private.connections c on c.id=t.connection_id
            where {' and '.join(conditions)} order by t.transaction_date desc,t.id desc limit %s""",
            (*values, limit + 1)).fetchall()
    has_more = len(rows) > limit
    rows = rows[:limit]
    return {"transactions": [expense_row(row) for row in rows],
            "next_cursor": encoded_cursor(rows[-1]) if has_more else None}


@router.patch("/{expense_id}")
def update_visibility(expense_id: UUID, body: ExpenseVisibility,
                      user_id: str = Depends(get_current_user_id)):
    with transaction() as db:
        row = db.execute("""update keepit_private.transactions t set hidden=%s,updated_at=now()
            from keepit_private.connections c where t.id=%s and t.connection_id=c.id and c.user_id=%s
            returning t.*""", (body.hidden, expense_id, user_id)).fetchone()
        if not row:
            raise HTTPException(404, "Expense not found")
        return expense_row(row)
