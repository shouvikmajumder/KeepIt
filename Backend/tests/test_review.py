import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from fastapi import HTTPException
from pydantic import ValidationError
from db_case import DatabaseCase
from app.postgres import transaction
from app.routers.review import review, Review
from app.routers.connections import disconnect
from app.routers.subscriptions import delete_subscription, update_subscription
from app.schemas import SubscriptionUpdate
from app.discovery import store_stream


class ReviewContractTests(unittest.TestCase):
    def test_legacy_add_action_is_rejected(self):
        with self.assertRaises(ValidationError):
            Review(action="add")


class ReviewTests(DatabaseCase):
    def test_currency_fallback_reprocesses_candidate_without_duplicates(self):
        connection = self.connection()
        connection["accounts"] = [{"id": "card", "label": "Card"}]
        stream = {"stream_id": "missing-currency", "account_id": "card", "is_active": True,
                  "frequency": "MONTHLY", "last_amount": {"amount": 15}, "predicted_next_date": "2027-01-31"}
        with transaction() as db:
            store_stream(db, connection, stream)
            before = db.execute("select * from keepit_private.candidates where connection_id=%s", (connection["id"],)).fetchone()
            self.assertIsNone(before["subscription_id"])
            connection["accounts"][0]["iso_currency_code"] = "USD"
            store_stream(db, connection, stream)
            store_stream(db, connection, stream)
            after = db.execute("select * from keepit_private.candidates where connection_id=%s", (connection["id"],)).fetchall()
            self.assertEqual(len(after), 1)
            self.assertEqual(after[0]["id"], before["id"])
            self.assertTrue(after[0]["observation"]["eligible"])
            rows = db.execute("select status,currency from public.subscriptions where connection_id=%s", (connection["id"],)).fetchall()
            self.assertEqual(rows, [{"status": "pending_review", "currency": "USD"}])

    def test_concurrent_confirmation_creates_one_subscription(self):
        connection = self.connection()
        candidate = self.candidate(connection)
        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(lambda _: review(candidate, Review(action="confirm"), self.owner), range(4)))
        self.assertEqual(len({result["subscription_id"] for result in results}), 1)
        with transaction() as db:
            self.assertEqual(db.execute("select count(*) as n from public.subscriptions where user_id=%s", (self.owner,)).fetchone()["n"], 1)

    def test_review_cannot_access_another_user(self):
        candidate = self.candidate(self.connection())
        with self.assertRaises(HTTPException) as error:
            review(candidate, Review(action="confirm"), self.other)
        self.assertEqual(error.exception.status_code, 404)

    def test_missing_date_and_unsupported_candidate(self):
        connection = self.connection()
        candidate = self.candidate(connection, next_renewal_date=None)
        with self.assertRaises(HTTPException):
            review(candidate, Review(action="confirm"), self.owner)
        review(candidate, Review(action="confirm", next_renewal_date="2026-10-01"), self.owner)
        unsupported = self.candidate(connection, eligible=False, reason="Only USD")
        with self.assertRaises(HTTPException):
            review(unsupported, Review(action="confirm"), self.owner)

    def test_provider_updates_preserve_edits_and_ignored_decisions(self):
        connection = self.connection()
        connection["accounts"] = [{"id": "account", "label": "Card"}]
        stream = {"stream_id": "stream", "account_id": "account", "merchant_name": "Netflix",
                  "frequency": "MONTHLY", "is_active": True, "predicted_next_date": "2026-10-01",
                  "last_amount": {"amount": 15, "iso_currency_code": "USD"}}
        with transaction() as db:
            store_stream(db, connection, stream)
            candidate = db.execute("select id from keepit_private.candidates where connection_id=%s", (connection["id"],)).fetchone()["id"]
        review(candidate, Review(action="ignore"), self.owner)
        with transaction() as db:
            store_stream(db, connection, stream)
            self.assertEqual(db.execute("select decision from keepit_private.candidates where id=%s", (candidate,)).fetchone()["decision"], "ignored")
        result = review(candidate, Review(action="confirm"), self.owner)
        update_subscription(result["subscription_id"], SubscriptionUpdate(name="My Netflix", cost="19.00",
            next_renewal_date="2026-10-01"), self.owner)
        stream["last_amount"]["amount"] = 25
        with transaction() as db:
            store_stream(db, connection, stream)
            row = db.execute("select * from public.subscriptions where id=%s", (result["subscription_id"],)).fetchone()
        self.assertEqual(str(row["cost"]), "19.00")
        self.assertEqual(row["name"], "My Netflix")
        self.assertEqual(row["provider_observation"]["cost"], "25.00")

    def test_eligible_stream_is_provisional_until_confirmed(self):
        connection = self.connection()
        connection["accounts"] = [{"id": "account", "label": "Card"}]
        stream = {"stream_id": "stream", "account_id": "account", "merchant_name": "Netflix",
                  "frequency": "MONTHLY", "is_active": True, "predicted_next_date": "2026-10-01",
                  "last_amount": {"amount": 15, "iso_currency_code": "USD"}}
        with transaction() as db:
            store_stream(db, connection, stream)
            candidate = db.execute("select * from keepit_private.candidates where connection_id=%s", (connection["id"],)).fetchone()
            sub = db.execute("select * from public.subscriptions where id=%s", (candidate["subscription_id"],)).fetchone()
        self.assertEqual(candidate["decision"], "pending")
        self.assertEqual(sub["status"], "pending_review")
        review(candidate["id"], Review(action="confirm"), self.owner)
        with transaction() as db:
            self.assertEqual(db.execute("select status from public.subscriptions where id=%s", (sub["id"],)).fetchone()["status"], "active")

    def test_removing_a_provisional_subscription_ignores_its_stream(self):
        connection = self.connection()
        connection["accounts"] = [{"id": "account", "label": "Card"}]
        stream = {"stream_id": "stream", "account_id": "account", "merchant_name": "Netflix",
                  "frequency": "MONTHLY", "is_active": True, "predicted_next_date": "2026-10-01",
                  "last_amount": {"amount": 15, "iso_currency_code": "USD"}}
        with transaction() as db:
            store_stream(db, connection, stream)
            candidate = db.execute("select * from keepit_private.candidates where connection_id=%s", (connection["id"],)).fetchone()
        delete_subscription(candidate["subscription_id"], self.owner)
        with transaction() as db:
            store_stream(db, connection, stream)
            candidate = db.execute("select * from keepit_private.candidates where id=%s", (candidate["id"],)).fetchone()
        self.assertEqual(candidate["decision"], "ignored")
        self.assertIsNone(candidate["subscription_id"])

    def test_disconnect_preserves_confirmed_subscriptions(self):
        connection = self.connection()
        result = review(self.candidate(connection), Review(action="confirm"), self.owner)
        with patch("app.routers.connections.decrypt", return_value="test-token"), patch("app.routers.connections.plaid"):
            with transaction() as db:
                disconnect(db, connection["id"], self.owner)
        with transaction() as db:
            row = db.execute("select * from public.subscriptions where id=%s", (result["subscription_id"],)).fetchone()
            self.assertEqual(row["source"], "manual")
            self.assertIsNone(row["connection_id"])
            self.assertEqual(db.execute("select count(*) as n from keepit_private.candidates").fetchone()["n"], 0)
