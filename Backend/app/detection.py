"""Deterministic subscription evidence, evaluated from posted payment history."""
from calendar import monthrange
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from hashlib import sha256
from statistics import median
import re


PROCESSORS = {"paypal", "stripe", "apple", "google", "amazon", "square"}


def normalize(value):
    value = str(value or "").lower().replace("+", " plus ")
    value = re.sub(r"\b(?:ref|reference|order|transaction|txn)\s*#?\s*[a-z0-9-]+$", "", value)
    value = re.sub(r"[\s#*-]+\d{4,}$", "", value)
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def identity(merchant, description=""):
    name = normalize(merchant) or normalize(description)
    # Processor-only merchant names need an explicit separated service descriptor.
    # APPLE.COM/BILL and GOOGLE PAY are still ambiguous.
    if name.split(" ")[0] in PROCESSORS:
        raw = str(description or "")
        if "*" in raw:
            prefix, suffix = raw.split("*", 1)
            service = normalize(suffix)
            if normalize(prefix).split(" ")[0] in PROCESSORS and len(service) >= 3:
                if service not in {"bill", "billing", "payment", "purchase", "store", "services"}:
                    return normalize(prefix) + " service " + service, False
        return name, True
    return name, not name or name in {"transaction", "recurring payment"}


def shift(day, months):
    year, month = divmod(day.year * 12 + day.month - 1 + months, 12)
    return date(year, month + 1, min(day.day, monthrange(year, month + 1)[1]))


def expired(last_date, frequency, today):
    if not last_date:
        return True
    last = date.fromisoformat(str(last_date))
    return today > shift(last, 24 if frequency == "ANNUALLY" else 2) + timedelta(
        days=35 if frequency == "ANNUALLY" else 7)


def clean_history(rows, today=None):
    today = today or date.today()
    unique = {}
    for row in rows:
        if (not row.get("pending") and row.get("currency") == "USD"
                and Decimal(str(row["amount"])) > 0
                and date.fromisoformat(str(row["transaction_date"])) <= today):
            unique[row["transaction_id"]] = row
    return sorted(unique.values(), key=lambda row: (row["transaction_date"], row["transaction_id"]))


def stable(values):
    center = median(values)
    tolerance = max(Decimal("1.00"), center * Decimal("0.05"))
    return all(abs(value - center) <= tolerance for value in values)


def price_evidence(values):
    if not values:
        return False, None, "limited_history"
    if stable(values):
        return True, values[-1], "stable_price"
    # A step needs a stable earlier price and at least two charges at the new one.
    for split in range(2, len(values) - 1):
        if stable(values[:split]) and stable(values[split:]):
            return True, values[-1], "price_step"
    if len(values) >= 3 and stable(values[:-1]):
        return False, values[-2], "pending_price_change"
    return False, None, "variable_price"


def monthly_fit(days):
    if len(days) < 3:
        return False, days[-1] if days else None
    origin = days[0].year * 12 + days[0].month - 1
    best = None
    for anchor in range(1, 32):
        slots = []
        deviation = 0
        for day in days:
            center = day.year * 12 + day.month - 1
            choices = []
            for slot in (center - 1, center, center + 1):
                year, month = divmod(slot, 12)
                expected = date(year, month + 1, min(anchor, monthrange(year, month + 1)[1]))
                choices.append((abs((day - expected).days), slot - origin, expected))
            delta, slot, expected = min(choices)
            if delta <= 7:
                slots.append((slot, expected))
                deviation += delta
        indices = {slot for slot, _ in slots}
        if not indices:
            continue
        # Multiple payments in a slot are ambiguous; do not cherry-pick a subset.
        coverage = len(indices) / max(len(days), max(indices) - min(indices) + 1)
        consecutive = any(i + 1 in indices and i + 2 in indices for i in indices)
        valid = len(indices) == len(slots) and coverage >= .8 and consecutive
        rank = (valid, len(indices), -deviation)
        if best is None or rank > best[0]:
            best = (rank, valid, max(slots)[1], anchor)
    if not best:
        return False, days[-1]
    # Preserve the fitted day, including a day-31 anchor after February.
    next_month = shift(best[2].replace(day=1), 1)
    next_date = next_month.replace(day=min(best[3], monthrange(next_month.year, next_month.month)[1]))
    return best[1], next_date


def evidence(rows, frequency, provider_mature=False, today=None):
    today = today or date.today()
    rows = clean_history(rows, today)
    days = [date.fromisoformat(str(row["transaction_date"])) for row in rows]
    minimum = {"MONTHLY": 3, "ANNUALLY": 2}.get(frequency)
    enough = minimum is not None and len(rows) >= minimum
    if frequency == "MONTHLY":
        cadence, predicted = monthly_fit(days)
    elif frequency == "ANNUALLY":
        cadence = len(days) >= 2 and all(330 <= (b - a).days <= 400 for a, b in zip(days, days[1:]))
        predicted = shift(days[-1], 12) if days else None
    else:
        cadence, predicted = False, None
    price_ok, amount, price_code = price_evidence([Decimal(str(row["amount"])) for row in rows])
    return {"payment_count": len(rows), "cadence": enough and (provider_mature or cadence),
            "price_stable": price_ok, "price_code": price_code,
            "estimated_amount": str(amount) if amount is not None else None,
            "last_payment_date": days[-1].isoformat() if days else None,
            "first_payment_date": days[0].isoformat() if days else None,
            "predicted_next_date": predicted.isoformat() if predicted else None,
            "expired": expired(days[-1], frequency, today) if days and minimum else True}


def local_streams(rows, today=None):
    groups = defaultdict(list)
    for row in clean_history(rows, today):
        key, _ = identity(row.get("merchant_name"), row.get("display_name"))
        groups[(row["account_id"], key)].append(row)
    for (account, key), history in sorted(groups.items()):
        if len(history) < 2:
            continue
        monthly = evidence(history, "MONTHLY", today=today)
        annual = evidence(history, "ANNUALLY", today=today)
        frequency = "ANNUALLY" if annual["cadence"] and not monthly["cadence"] else "MONTHLY"
        latest = history[-1]
        digest = sha256(f"{account}|{key}|{frequency}".encode()).hexdigest()
        yield {"stream_id": "history:" + digest, "account_id": account,
               "merchant_name": latest.get("merchant_name"), "description": latest.get("display_name"),
               "frequency": frequency, "status": "UNKNOWN", "is_active": True,
               "last_amount": {"amount": str(latest["amount"]), "iso_currency_code": "USD"},
               "personal_finance_category": {"primary": latest.get("pfc_primary"),
                   "detailed": latest.get("pfc_detailed"), "confidence_level": latest.get("pfc_confidence")},
               "transaction_ids": [row["transaction_id"] for row in history],
               "_history": history, "_source": "history", "_today": today}
