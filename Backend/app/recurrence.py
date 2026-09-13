"""Calendar estimates; advancing a date does not prove a payment happened."""

from calendar import monthrange
from datetime import date
from decimal import Decimal, ROUND_HALF_UP


def next_occurrence(anchor: date, interval: str, today: date) -> date:
    step = 12 if interval == "annual" else 1
    elapsed = (today.year - anchor.year) * 12 + today.month - anchor.month
    months = max(0, elapsed // step * step)
    while True:
        year, month = divmod(anchor.year * 12 + anchor.month - 1 + months, 12)
        month += 1
        # Always clamp the ORIGINAL day: Jan 31 -> Feb 28 -> Mar 31.
        candidate = date(year, month, min(anchor.day, monthrange(year, month)[1]))
        if candidate >= today:
            return candidate
        months += step


def project(row: dict, today: date) -> dict:
    result = dict(row)
    result["account_label"] = (row.get("provider_observation") or {}).get("account_label")
    if row.get("status", "active") == "active":
        anchor = date.fromisoformat(str(row.get("recurrence_anchor") or row["next_renewal_date"]))
        result["next_renewal_date"] = next_occurrence(
            anchor, row.get("billing_interval", "monthly"), today
        ).isoformat()
    return result


def monthly_total(rows: list[dict]) -> Decimal:
    total = sum((Decimal(str(row["cost"])) / (12 if row["billing_interval"] == "annual" else 1)
                 for row in rows if row["status"] == "active"), Decimal("0"))
    # Round once at the end so many annual subscriptions do not accumulate error.
    return total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
