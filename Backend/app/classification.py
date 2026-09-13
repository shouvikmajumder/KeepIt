"""Explainable recurring-payment rules; confidence labels are not probabilities.

Category names: https://plaid.com/documents/pfc-taxonomy-all.csv (PFCv2).
Keep service aliases narrow: a marketplace or payment processor is not a service.
"""
import re

CLASSIFIER_VERSION = 2
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
    count = len({value for value in (stream.get("transaction_ids") or []) if isinstance(value, str) and value})
    kind, confidence, codes, explanation = "unknown", "possible", [], "The payment type is not yet established."
    if not stream.get("is_active") or stream.get("status") == "TOMBSTONED":
        confidence, codes, explanation = "excluded", ["inactive"], "This recurring stream is no longer active."
    elif reliable and primary in EXCLUDED_PRIMARY:
        confidence, codes, explanation = "excluded", ["financial_movement"], "Transfers, debt repayments, income, and bank fees are not subscriptions or bills."
    elif service and detailed in BILL_CATEGORIES and reliable:
        codes, explanation = ["conflicting_evidence"], "The service name and bill category disagree. Choose the payment type."
    elif service:
        kind, codes, explanation = "subscription", ["specific_service"], "A specific subscription service was recognized."
    elif reliable and (primary in PURCHASE_PRIMARY or detailed == "TRANSPORTATION_GAS"):
        confidence, codes, explanation = "excluded", ["ordinary_purchase"], "Repeated purchases are not evidence of a subscription or bill."
    elif detailed in BILL_CATEGORIES:
        kind, codes, explanation = "bill", ["bill_category"], "The category suggests a recurring household bill."
    elif detailed in POSSIBLE_SUBSCRIPTION_CATEGORIES:
        kind, codes, explanation = "subscription", ["ambiguous_service_category"], "This category includes both memberships and individual purchases."
    else:
        codes = ["unclassified"]
    if confidence != "excluded":
        mature = stream.get("status") == "MATURE"
        minimum = {"MONTHLY": 3, "ANNUALLY": 2}.get(stream.get("frequency"))
        enough = minimum is not None and count >= minimum
        type_evidence = ((service and kind == "subscription")
                         or (kind in ("subscription", "bill") and reliable))
        if mature and enough and type_evidence:
            confidence = "strong"
            codes.append("mature_history")
            explanation += f" Plaid reports a mature stream with {count} recorded payments."
        else:
            if not mature or not enough:
                codes.append("limited_history")
                explanation += " More recurring-payment history is needed for strong evidence."
            if kind == "bill" and not reliable:
                codes.append("uncertain_category")
                explanation += " The category is not highly confident."
    return {"payment_type": kind, "confidence": confidence, "reason_codes": codes,
            "explanation": explanation, "classifier_version": CLASSIFIER_VERSION,
            "payment_count": count}
