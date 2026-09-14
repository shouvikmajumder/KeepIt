from datetime import date
from decimal import Decimal
import unittest

from app.classification import classify
from app.detection import evidence, identity, local_streams, shift


TODAY = date(2026, 9, 13)


def payments(days=None, amounts=None, **changes):
    days = days or ["2026-06-30", "2026-07-31", "2026-08-31"]
    amounts = amounts or ["15.00"] * len(days)
    return [{"transaction_id": str(i), "transaction_date": date.fromisoformat(day),
             "amount": Decimal(amount), "pending": False, "currency": "USD",
             "account_id": "card", "merchant_name": "Small software company", "display_name": "Small software company",
             **changes} for i, (day, amount) in enumerate(zip(days, amounts))]


def classification(rows, **changes):
    stream = next(local_streams(rows, TODAY))
    return classify({**stream, **changes})


class DetectionTests(unittest.TestCase):
    def test_unknown_merchant_stable_monthly_and_annual(self):
        monthly = classification(payments())
        self.assertEqual((monthly["payment_type"], monthly["confidence"]), ("subscription", "strong"))
        annual = classification(payments(["2025-08-31", "2026-08-31"]))
        self.assertEqual(annual["confidence"], "strong")

    def test_month_ends_and_posting_delays(self):
        rows = payments(["2026-01-31", "2026-02-28", "2026-04-02"])
        facts = evidence(rows, "MONTHLY", today=date(2026, 4, 5))
        self.assertTrue(facts["cadence"])
        self.assertEqual(facts["predicted_next_date"], "2026-04-30")

    def test_habitual_and_financial_purchases_are_excluded_even_with_weak_categories(self):
        for primary, detailed in [("FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE"),
                                  ("GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_GROCERIES"),
                                  ("TRANSPORTATION", "TRANSPORTATION_GAS"),
                                  ("TRANSFER_OUT", None), ("LOAN_PAYMENTS", None),
                                  ("BANK_FEES", None), ("INCOME", None), ("OTHER", "ATM_CASH")]:
            with self.subTest(primary=primary):
                self.assertEqual(classification(payments(pfc_primary=primary, pfc_detailed=detailed))["confidence"], "excluded")

    def test_bills_are_separate_from_subscriptions(self):
        for detailed in ("RENT_AND_UTILITIES_RENT", "RENT_AND_UTILITIES_WATER", "GENERAL_SERVICES_INSURANCE"):
            result = classification(payments(pfc_detailed=detailed, pfc_confidence="HIGH"))
            self.assertEqual((result["payment_type"], result["confidence"]), ("bill", "strong"))

    def test_generic_processors_require_service_descriptor(self):
        for merchant in ("PayPal", "Stripe", "Apple", "Google", "Amazon"):
            self.assertEqual(classification(payments(merchant_name=merchant, display_name=merchant))["confidence"], "possible")
        result = classification(payments(merchant_name="PayPal", display_name="PAYPAL * TASKSOFT 123456"))
        self.assertEqual(result["confidence"], "strong")
        self.assertTrue(identity("Apple", "APPLE.COM/BILL")[1])
        self.assertEqual(identity("Office 365")[0], "office 365")

    def test_price_tolerance_and_confirmed_step(self):
        self.assertEqual(classification(payments(amounts=["15", "15.50", "15.80"]))["confidence"], "strong")
        rows = payments(["2026-05-31", "2026-06-30", "2026-07-31", "2026-08-31"], ["15", "15", "22", "22"])
        result = classification(rows)
        self.assertEqual(result["confidence"], "strong")
        self.assertIn("price_step", result["reason_codes"])
        self.assertEqual(result["history_evidence"]["estimated_amount"], "22")
        self.assertEqual(classification(payments(amounts=["15", "15", "22"]))["confidence"], "possible")
        self.assertEqual(classification(payments(amounts=["8", "42", "16"]))["confidence"], "possible")

    def test_pending_refunds_foreign_duplicates_do_not_establish_history(self):
        rows = payments()
        rows[1]["pending"] = True
        rows[2]["amount"] = Decimal("-15")
        rows.append(dict(rows[0]))
        rows.append({**rows[0], "transaction_id": "eur", "currency": "EUR"})
        self.assertEqual(evidence(rows, "MONTHLY", True, TODAY)["payment_count"], 1)
        self.assertFalse(evidence(rows, "MONTHLY", True, TODAY)["cadence"])

    def test_irregular_history_and_multiple_charges_per_month_stay_hidden(self):
        self.assertEqual(classification(payments(["2026-05-04", "2026-06-20", "2026-08-03"]))["confidence"], "possible")
        rows = payments(["2026-06-01", "2026-06-02", "2026-07-01", "2026-07-02", "2026-08-01", "2026-08-02"])
        self.assertEqual(classification(rows)["confidence"], "possible")

    def test_missing_cycle_coverage_and_expiration(self):
        rows = payments(["2026-03-31", "2026-04-30", "2026-05-31", "2026-07-31", "2026-08-31"])
        self.assertTrue(evidence(rows, "MONTHLY", today=TODAY)["cadence"])
        self.assertFalse(evidence(payments(), "MONTHLY", today=date(2026, 10, 2))["expired"])
        self.assertTrue(evidence(payments(), "MONTHLY", today=date(2026, 11, 8))["expired"])

    def test_provider_maturity_is_cadence_only_and_tombstones_win(self):
        rows = payments(amounts=["8", "42", "16"])
        self.assertEqual(classification(rows, status="MATURE")["confidence"], "possible")
        self.assertEqual(classification(payments(), status="TOMBSTONED")["confidence"], "excluded")
        self.assertEqual(classify({"merchant_name": "Netflix", "status": "MATURE", "is_active": True,
                                  "frequency": "MONTHLY", "transaction_ids": ["a", "b", "c"]})["confidence"], "possible")

    def test_accounts_are_not_combined_and_keys_survive_new_charges(self):
        rows = payments()
        first = list(local_streams(rows, TODAY))[0]["stream_id"]
        additional = {**rows[-1], "transaction_id": "new", "transaction_date": date(2026, 9, 30)}
        self.assertEqual(list(local_streams(rows + [additional], date(2026, 10, 1)))[0]["stream_id"], first)
        other = [{**row, "transaction_id": "other" + row["transaction_id"], "account_id": "other"} for row in rows]
        self.assertEqual(len(list(local_streams(rows + other, TODAY))), 2)
