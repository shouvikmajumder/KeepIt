"""Explainable recurring-payment rules; confidence labels are not probabilities.

Category names: https://plaid.com/documents/pfc-taxonomy-all.csv (PFCv2).
Keep service aliases narrow: a marketplace or payment processor is not a service.
"""
import re
from .detection import evidence, identity

CLASSIFIER_VERSION = 3
BILL_CATEGORIES = {
    "RENT_AND_UTILITIES_RENT", "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY",
    "RENT_AND_UTILITIES_WATER", "RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT",
    "RENT_AND_UTILITIES_INTERNET_AND_CABLE", "RENT_AND_UTILITIES_TELEPHONE",
    "GENERAL_SERVICES_INSURANCE",
}
POSSIBLE_SUBSCRIPTION_CATEGORIES = {
    "ENTERTAINMENT_MUSIC_AND_AUDIO", "ENTERTAINMENT_TV_AND_MOVIES",
    "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS",
}
EXCLUDED_PRIMARY = {"TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS", "LOAN_DISBURSEMENTS", "BANK_FEES", "INCOME"}
PURCHASE_PRIMARY = {"GENERAL_MERCHANDISE", "FOOD_AND_DRINK"}
SERVICE_ALIASES = {
    "netflix", "spotify", "spotify premium", "hulu", "disney plus", "disneyplus",
    "adobe creative cloud", "microsoft 365", "office 365", "youtube premium",
    "amazon prime", "amazon prime membership", "prime video", "apple music",
    "apple icloud", "icloud", "icloud plus", "planet fitness", "anytime fitness",
}
# Multiword service descriptions may appear after a processor prefix or before an ID.
# Single-word merchants require an exact merchant match to avoid substring guesses.
DESCRIPTION_ALIASES = {alias for alias in SERVICE_ALIASES if " " in alias}


def normalized(value):
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower().replace("+", " plus ")).strip()


def classify(stream):
    category = stream.get("personal_finance_category") or {}
    primary, detailed = category.get("primary"), category.get("detailed")
    reliable = (category.get("version") in (None, "v1", "v2")
                and category.get("confidence_level") in ("HIGH", "VERY_HIGH"))
    merchant, description = normalized(stream.get("merchant_name")), normalized(stream.get("description"))
    service = merchant in SERVICE_ALIASES or any(
        f" {alias} " in f" {description} " for alias in DESCRIPTION_ALIASES)
    history = stream.get("_history", [])
    facts = evidence(history, stream.get("frequency"),
                     provider_mature=stream.get("status") == "MATURE", today=stream.get("_today"))
    count = facts["payment_count"]
    _, ambiguous = identity(stream.get("merchant_name"), stream.get("description"))
    categories = [category] + [{"primary": row.get("pfc_primary"), "detailed": row.get("pfc_detailed")}
                               for row in history]
    financial = any(c.get("primary") in EXCLUDED_PRIMARY or "CASH" in (c.get("detailed") or "") for c in categories)
    purchases = any(c.get("primary") in PURCHASE_PRIMARY or c.get("detailed") == "TRANSPORTATION_GAS" for c in categories)
    bills = any(c.get("detailed") in BILL_CATEGORIES or c.get("primary") == "RENT_AND_UTILITIES" for c in categories)
    kind, confidence, codes, explanation = "unknown", "possible", [], "The payment type is not yet established."
    if not stream.get("is_active") or stream.get("status") == "TOMBSTONED":
        confidence, codes, explanation = "excluded", ["inactive"], "This recurring stream is no longer active."
    elif financial:
        confidence, codes, explanation = "excluded", ["financial_movement"], "Transfers, debt repayments, income, and bank fees are not subscriptions or bills."
    elif service and bills:
        codes, explanation = ["conflicting_evidence"], "The service name and bill category disagree."
    elif purchases:
        confidence, codes, explanation = "excluded", ["ordinary_purchase"], "Repeated purchases are not evidence of a subscription or bill."
    elif service:
        kind, codes, explanation = "subscription", ["specific_service"], "A specific subscription service was recognized."
    elif bills:
        kind, codes, explanation = "bill", ["bill_category"], "The category suggests a recurring household bill."
    elif detailed in POSSIBLE_SUBSCRIPTION_CATEGORIES:
        kind, codes, explanation = "subscription", ["subscription_category"], "The service category is consistent with a subscription."
    elif ambiguous:
        codes, explanation = ["ambiguous_merchant"], "A specific service has not been identified."
    else:
        kind, codes, explanation = "subscription", ["history_pattern"], "A consistent subscription payment pattern was found."
    if confidence != "excluded":
        # Bills keep their independent variable-amount policy. Every subscription,
        # including a recognized brand, must have actual stable posted history.
        type_evidence = kind == "subscription" or (kind == "bill" and reliable)
        if facts["cadence"] and type_evidence and (facts["price_stable"] or kind == "bill") and not facts["expired"]:
            confidence = "strong"
            codes.extend(["regular_cadence", facts["price_code"]])
            explanation += f" Supported by {count} posted payments."
        else:
            if not facts["cadence"]:
                codes.append("limited_history")
                explanation += " More recurring-payment history is needed for strong evidence."
            if not facts["price_stable"]:
                codes.append(facts["price_code"])
            if facts["expired"]:
                codes.append("missed_cycles")
            if kind == "bill" and not reliable:
                codes.append("uncertain_category")
                explanation += " The category is not highly confident."
    return {"payment_type": kind, "confidence": confidence, "reason_codes": codes,
            "explanation": explanation, "classifier_version": CLASSIFIER_VERSION,
            "payment_count": count, "history_evidence": facts,
            "detection_source": stream.get("_source", "plaid")}
