from unittest.mock import patch
from db_case import DatabaseCase
from app.postgres import transaction, enqueue
from app.plaid_client import PlaidError
from app.worker import run_once
from app.routers.connections import disconnect
from app.discovery import store_stream
from test_classification import stream


class WorkerTests(DatabaseCase):
    def test_failed_refresh_rolls_back_partial_reclassification(self):
        connection = self.queued()
        connection["accounts"] = [{"id": "card"}]
        with transaction() as db:
            store_stream(db, connection, stream())
            before = db.execute("select observation from keepit_private.candidates where connection_id=%s", (connection["id"],)).fetchone()
        def failing_sync(db, _):
            store_stream(db, connection, stream(is_active=False))
            raise RuntimeError("simulated failure after one stream")
        with patch("app.worker.sync", side_effect=failing_sync):
            self.assertTrue(run_once())
        with transaction() as db:
            self.assertEqual(before, db.execute("select observation from keepit_private.candidates where connection_id=%s", (connection["id"],)).fetchone())
            self.assertEqual(db.execute("select count(*) as n from public.subscriptions where connection_id=%s", (connection["id"],)).fetchone()["n"], 1)

    def queued(self):
        connection = self.connection()
        with transaction() as db:
            enqueue(db, connection["id"])
        return connection

    def test_pending_data_is_not_reported_as_empty_complete(self):
        connection = self.queued()
        with patch("app.worker.sync", side_effect=PlaidError("PRODUCT_NOT_READY")):
            self.assertTrue(run_once())
        with transaction() as db:
            row = db.execute("select * from keepit_private.connections where id=%s", (connection["id"],)).fetchone()
            job = db.execute("select *, available_at>now() as delayed from keepit_private.jobs").fetchone()
        self.assertEqual(row["sync_status"], "syncing")
        self.assertIsNone(row["last_synced_at"])
        self.assertEqual(job["attempts"], 1)
        self.assertTrue(job["delayed"])

    def test_missed_webhook_reconciliation_and_repeat_queue(self):
        connection = self.queued()
        with transaction() as db:
            enqueue(db, connection["id"])
        responses = {
            "/accounts/get": {"accounts": [{"account_id": "a", "name": "Card", "mask": "1234", "type": "credit"}], "item": {}},
            "/transactions/recurring/get": {"outflow_streams": []},
        }
        with patch("app.worker.decrypt", return_value="test-token"), patch("app.worker.plaid", side_effect=lambda path, **_: responses[path]):
            self.assertTrue(run_once())
            self.assertFalse(run_once())
        with transaction() as db:
            row = db.execute("select * from keepit_private.connections where id=%s", (connection["id"],)).fetchone()
            self.assertEqual(row["sync_status"], "ready")
            self.assertIsNotNone(row["last_synced_at"])
            self.assertEqual(db.execute("select count(*) as n from keepit_private.jobs").fetchone()["n"], 1)

    def test_disconnect_failure_keeps_credentials_for_retry(self):
        connection = self.queued()
        with patch("app.routers.connections.decrypt", return_value="token"), patch("app.routers.connections.plaid", side_effect=PlaidError("PROVIDER_UNAVAILABLE")):
            with self.assertRaises(PlaidError):
                with transaction() as db:
                    disconnect(db, connection["id"], self.owner)
        with transaction() as db:
            self.assertIsNotNone(db.execute("select id from keepit_private.connections where id=%s", (connection["id"],)).fetchone())

    def test_login_error_requires_reconnect(self):
        connection = self.queued()
        with patch("app.worker.sync", side_effect=PlaidError("ITEM_LOGIN_REQUIRED")):
            run_once()
        with transaction() as db:
            self.assertEqual(db.execute("select sync_status from keepit_private.connections where id=%s", (connection["id"],)).fetchone()["sync_status"], "needs_reconnect")
