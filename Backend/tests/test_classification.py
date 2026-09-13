import unittest
from pathlib import Path
from db_case import DatabaseCase
from app.classification import CLASSIFIER_VERSION
from app.discovery import observation, store_stream
from app.postgres import transaction
from app.routers.dashboard import dashboard
from app.routers.subscriptions import update_subscription
from app.schemas import SubscriptionUpdate


def stream(**changes):
    return {"stream_id": "sample", "account_id": "card", "merchant_name": "Netflix", "description": "",
            "is_active": True, "status": "MATURE", "frequency": "MONTHLY",
            "transaction_ids": ["one", "two", "three"], "last_amount": {"amount": 15, "iso_currency_code": "USD"},
            "average_amount": {"amount": 14}, "predicted_next_date": "2027-01-31", **changes}


def category(primary, detailed, confidence="HIGH"):
    return {"primary": primary, "detailed": detailed, "confidence_level": confidence, "version": "v2"}


# Labeled acceptance corpus: this measures rule coverage, not production accuracy.
CASES = [
    ("monthly streaming", {}, "subscription", "strong"),
    ("annual software", {"merchant_name": "Adobe Creative Cloud", "frequency": "ANNUALLY", "transaction_ids": ["one", "two"]}, "subscription", "strong"),
    ("gym membership", {"merchant_name": "Planet Fitness"}, "subscription", "strong"),
    ("variable utility", {"merchant_name": "Power company", "last_amount": {"amount": 160, "iso_currency_code": "USD"}, "average_amount": {"amount": 85}, "personal_finance_category": category("RENT_AND_UTILITIES", "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY")}, "bill", "strong"),
    ("rent", {"merchant_name": "Landlord", "personal_finance_category": category("RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT")}, "bill", "strong"),
    ("insurance", {"merchant_name": "Insurer", "personal_finance_category": category("GENERAL_SERVICES", "GENERAL_SERVICES_INSURANCE")}, "bill", "strong"),
    ("credit repayment", {"personal_finance_category": category("LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT")}, "unknown", "excluded"),
    ("bnpl", {"personal_finance_category": category("LOAN_PAYMENTS", "LOAN_PAYMENTS_BNPL")}, "unknown", "excluded"),
    ("transfer overrides merchant", {"personal_finance_category": category("TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER")}, "unknown", "excluded"),
    ("bank fee", {"personal_finance_category": category("BANK_FEES", "BANK_FEES_OTHER_BANK_FEES")}, "unknown", "excluded"),
    ("shopping", {"merchant_name": "Amazon", "personal_finance_category": category("GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES")}, "unknown", "excluded"),
    ("coffee", {"merchant_name": "Cafe", "personal_finance_category": category("FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE")}, "unknown", "excluded"),
    ("fuel", {"merchant_name": "Gas station", "personal_finance_category": category("TRANSPORTATION", "TRANSPORTATION_GAS")}, "unknown", "excluded"),
    ("ambiguous marketplace", {"merchant_name": "Amazon"}, "unknown", "possible"),
    ("specific marketplace service", {"merchant_name": "Amazon", "description": "AMAZON PRIME MEMBERSHIP 1234"}, "subscription", "strong"),
    ("generic processor", {"merchant_name": "PayPal"}, "unknown", "possible"),
    ("generic apple", {"merchant_name": "Apple"}, "unknown", "possible"),
    ("merchant substring", {"merchant_name": "NotNetflix"}, "unknown", "possible"),
    ("early detection", {"status": "EARLY_DETECTION", "transaction_ids": ["one"]}, "subscription", "possible"),
    ("missing status", {"status": None}, "subscription", "possible"),
    ("duplicate history", {"transaction_ids": ["one", "one", "two"]}, "subscription", "possible"),
    ("missing history", {"transaction_ids": None}, "subscription", "possible"),
    ("weak bill category", {"merchant_name": "Power", "personal_finance_category": category("RENT_AND_UTILITIES", "RENT_AND_UTILITIES_WATER", "LOW")}, "bill", "possible"),
    ("category establishes membership", {"merchant_name": "Local gym", "personal_finance_category": category("PERSONAL_CARE", "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS")}, "subscription", "strong"),
    ("conflict", {"personal_finance_category": category("RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT")}, "unknown", "possible"),
    ("unknown category", {"merchant_name": "Unknown", "personal_finance_category": category("NEW", "NEW_CATEGORY")}, "unknown", "possible"),
    ("inactive", {"is_active": False}, "unknown", "excluded"),
    ("tombstoned", {"status": "TOMBSTONED"}, "unknown", "excluded"),
]


class ClassificationTests(unittest.TestCase):
    def test_labeled_corpus(self):
        false_positives = missed_positives = 0
        for label, changes, kind, confidence in CASES:
            with self.subTest(label=label):
                data = observation(stream(**changes), [{"id": "card", "label": "Card"}])
                false_positives += confidence == "excluded" and data["confidence"] != "excluded"
                missed_positives += confidence != "excluded" and data["confidence"] == "excluded"
                self.assertEqual((data["payment_type"], data["confidence"]), (kind, confidence))
                self.assertEqual(data["eligible"], confidence != "excluded")
                self.assertTrue(data["reason_codes"])
                self.assertTrue(data["explanation"])
                self.assertEqual(data["classifier_version"], CLASSIFIER_VERSION)
        self.assertEqual((false_positives, missed_positives), (0, 0))

    def test_unsupported_cadences_never_become_monthly(self):
        for frequency in ("WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "UNKNOWN", "QUARTERLY", None):
            with self.subTest(frequency=frequency):
                data = observation(stream(frequency=frequency), [{"id": "card"}])
                self.assertIsNone(data["billing_interval"])
                self.assertEqual(data["provider_frequency"], frequency)
                self.assertFalse(data["eligible"])
                self.assertIn("monthly and annual", data["reason"])

    def test_missing_or_invalid_dates_are_not_valid_automatic_renewal_dates(self):
        for value in (None, "not-a-date", "1800-01-01", "2027-02-30"):
            data = observation(stream(predicted_next_date=value), [{"id": "card"}])
            self.assertIsNone(data["next_renewal_date"])
            self.assertTrue(data["eligible"])

    def test_no_raw_history_or_descriptions_persisted(self):
        data = observation(stream(description="sensitive description"), [{"id": "card"}])
        self.assertNotIn("transaction_ids", data)
        self.assertNotIn("description", data)
        self.assertEqual(data["average_amount"], "14.00")

    def test_invalid_money_and_foreign_average(self):
        for amount in (0, -1, "NaN", "Infinity", "0.001", "99999999.999", None):
            data = observation(stream(last_amount={"amount": amount, "iso_currency_code": "USD"}), [{"id": "card"}])
            self.assertFalse(data["eligible"])
        data = observation(stream(average_amount={"amount": 12, "iso_currency_code": "EUR"}), [{"id": "card"}])
        self.assertIsNone(data["average_amount"])


class ClassificationDatabaseTests(DatabaseCase):
    def prepared(self):
        connection = self.connection()
        connection["accounts"] = [{"id": "card", "label": "Card"}]
        return connection

    def save(self, connection, value):
        with transaction() as db:
            store_stream(db, connection, value)
            return db.execute("select * from keepit_private.candidates where connection_id=%s and stream_id=%s",
                              (connection["id"], value["stream_id"])).fetchone()

    def test_reclassification_removes_only_provisional_record(self):
        connection = self.prepared()
        initial = self.save(connection, stream())
        excluded = stream(personal_finance_category=category("TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER"))
        updated = self.save(connection, excluded)
        self.assertEqual(initial["id"], updated["id"])
        self.assertIsNotNone(updated["subscription_id"])
        self.assertEqual(updated["decision"], "confirmed")
        with transaction() as db:
            self.assertEqual(db.execute("select status from public.subscriptions where id=%s",
                (updated["subscription_id"],)).fetchone()["status"], "inactive")
        restored = self.save(connection, stream())
        self.assertIsNotNone(restored["subscription_id"])
        self.assertEqual(restored["subscription_id"], self.save(connection, stream())["subscription_id"])
        self.assertEqual(dashboard(user_id=self.owner)["subscription_monthly_estimate"], "15.00")

    def test_kept_type_and_values_survive_reclassification_and_edits(self):
        connection = self.prepared()
        detected = self.save(connection, stream())
        update_subscription(detected["subscription_id"], SubscriptionUpdate(name="My service", cost="18.00",
            next_renewal_date="2027-01-31", payment_type="subscription"), self.owner)
        self.save(connection, stream(is_active=False))
        self.save(connection, stream(merchant_name="Power", personal_finance_category=category("RENT_AND_UTILITIES", "RENT_AND_UTILITIES_WATER")))
        with transaction() as db:
            row = db.execute("select * from public.subscriptions where id=%s", (detected["subscription_id"],)).fetchone()
        self.assertEqual((row["status"], row["payment_type"], row["name"], str(row["cost"])),
                         ("active", "subscription", "My service", "18.00"))
        self.assertEqual(row["provider_observation"]["payment_type"], "bill")

    def test_uncertain_candidate_stays_hidden_until_it_becomes_strong(self):
        connection = self.prepared()
        pending = self.save(connection, stream(merchant_name="Unknown", predicted_next_date=None))
        self.assertIsNone(pending["subscription_id"])
        self.assertEqual(dashboard(user_id=self.owner)["subscription_monthly_estimate"], "0.00")
        promoted = self.save(connection, stream(stream_id="sample"))
        self.assertIsNotNone(promoted["subscription_id"])
        self.assertEqual(promoted["decision"], "confirmed")

    def test_missing_date_on_refresh_deactivates_automatic_row(self):
        connection = self.prepared()
        before = self.save(connection, stream())
        after = self.save(connection, stream(predicted_next_date=None))
        self.assertEqual(before["id"], after["id"])
        self.assertEqual(before["subscription_id"], after["subscription_id"])
        with transaction() as db:
            self.assertEqual(db.execute("select status from public.subscriptions where id=%s",
                (after["subscription_id"],)).fetchone()["status"], "inactive")

    def test_migration_preserves_records_and_decisions_and_queues_connections(self):
        from scripts.configure_tracking import inspect
        connection = self.prepared()
        pending = self.save(connection, stream())
        dismissed = self.save(connection, stream(stream_id="dismissed"))
        with transaction() as db:
            db.execute("update keepit_private.candidates set decision='ignored' where id=%s", (dismissed["id"],))
        with transaction() as db:
            db.execute("alter table public.subscriptions drop column payment_type")
            before = db.execute("select * from public.subscriptions order by id").fetchall()
            decisions = db.execute("select id,decision,subscription_id from keepit_private.candidates order by id").fetchall()
            self.assertEqual(inspect(db)[2], ["005_payment_classification.sql"])
            sql = (Path(__file__).parents[1] / "supabase/migrations/005_payment_classification.sql").read_text()
            db.execute("\n".join(line for line in sql.splitlines() if line.lower() not in ("begin;", "commit;")))
            after = db.execute("select * from public.subscriptions order by id").fetchall()
            self.assertTrue(all(row.pop("payment_type") == "unknown" for row in after))
            self.assertEqual(before, after)
            self.assertEqual(decisions, db.execute("select id,decision,subscription_id from keepit_private.candidates order by id").fetchall())
            self.assertEqual(inspect(db)[2], [])
            self.assertEqual(db.execute("select count(*) as n from keepit_private.jobs where connection_id=%s", (connection["id"],)).fetchone()["n"], 1)
