from datetime import date
from pathlib import Path
from unittest.mock import patch

from db_case import DatabaseCase
from app.postgres import transaction, enqueue
from app.reconciliation import reconcile
from app.transactions import store_transaction
from app.worker import run_once
from app.plaid_client import PlaidError
from app.detection import shift
from test_detection import payments, TODAY


class ReconciliationTests(DatabaseCase):
    def prepared(self, rows=None):
        connection = self.connection()
        connection["accounts"] = [{"id": "card", "label": "Card"}]
        rows = rows or payments()
        with transaction() as db:
            for row in rows:
                store_transaction(db, connection, {**row, "date": str(row["transaction_date"]),
                    "name": row["display_name"], "iso_currency_code": "USD"}, {"card": {"label": "Card"}})
        return connection

    def subscriptions(self, connection):
        with transaction() as db:
            return db.execute("select * from public.subscriptions where connection_id=%s order by id", (connection["id"],)).fetchall()

    def provider(self, **changes):
        return {"stream_id": "provider", "account_id": "card", "merchant_name": "Small software company",
                "is_active": True, "status": "MATURE", "frequency": "MONTHLY",
                "transaction_ids": ["0", "1", "2"], "last_amount": {"amount": 15, "iso_currency_code": "USD"}, **changes}

    def test_history_then_provider_adopts_identity_and_hidden_decision(self):
        conn = self.prepared()
        with transaction() as db:
            reconcile(db, conn, None, TODAY)
        before = self.subscriptions(conn)[0]
        with transaction() as db:
            db.execute("update public.subscriptions set hidden=true where id=%s", (before["id"],))
            reconcile(db, conn, [self.provider()], TODAY)
            reconcile(db, conn, [self.provider()], TODAY)
        rows = self.subscriptions(conn)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], before["id"])
        self.assertTrue(rows[0]["hidden"])
        self.assertEqual(rows[0]["provider_observation"]["detection_source"], "plaid")
        with transaction() as db:
            reconcile(db, conn, None, TODAY)
        self.assertEqual(self.subscriptions(conn)[0]["provider_observation"], rows[0]["provider_observation"])

    def test_preexisting_weak_provider_candidate_merges_history(self):
        conn = self.prepared()
        with transaction() as db:
            db.execute("""insert into keepit_private.candidates(connection_id,stream_id,detection_key,observation)
                values (%s,'provider','provider','{}')""", (conn["id"],))
            reconcile(db, conn, None, TODAY)
        before = self.subscriptions(conn)[0]
        with transaction() as db:
            reconcile(db, conn, [self.provider()], TODAY)
        self.assertEqual([row["id"] for row in self.subscriptions(conn)], [before["id"]])

    def test_identical_merchant_on_two_accounts_stays_separate(self):
        conn = self.prepared()
        conn["accounts"].append({"id": "other", "label": "Other"})
        with transaction() as db:
            for row in payments():
                store_transaction(db, conn, {"transaction_id": "other" + row["transaction_id"],
                    "account_id": "other", "date": str(row["transaction_date"]),
                    "merchant_name": row["merchant_name"], "amount": 15, "iso_currency_code": "USD"},
                    {"other": {"label": "Other"}})
            reconcile(db, conn, [self.provider()], TODAY)
        self.assertEqual(len(self.subscriptions(conn)), 2)

    def test_ignored_history_candidate_is_not_recreated_by_provider(self):
        conn = self.prepared()
        with transaction() as db:
            reconcile(db, conn, None, TODAY)
            db.execute("update keepit_private.candidates set decision='ignored' where connection_id=%s", (conn["id"],))
            reconcile(db, conn, [self.provider()], TODAY)
        self.assertEqual(len(self.subscriptions(conn)), 1)
        self.assertEqual(self.subscriptions(conn)[0]["status"], "inactive")

    def test_two_missed_cycles_and_provider_tombstone(self):
        conn = self.prepared()
        with transaction() as db:
            reconcile(db, conn, None, TODAY)
            reconcile(db, conn, None, date(2026, 10, 5))
        self.assertEqual(self.subscriptions(conn)[0]["status"], "active")
        with transaction() as db:
            reconcile(db, conn, None, date(2026, 11, 8))
        self.assertEqual(self.subscriptions(conn)[0]["status"], "inactive")
        with transaction() as db:
            reconcile(db, conn, [self.provider()], TODAY)
            reconcile(db, conn, [self.provider(status="TOMBSTONED")], TODAY)
        self.assertEqual(self.subscriptions(conn)[0]["status"], "inactive")

    def test_new_price_waits_for_second_charge(self):
        conn = self.prepared()
        with transaction() as db:
            reconcile(db, conn, None, TODAY)
            store_transaction(db, conn, {"transaction_id": "3", "account_id": "card", "date": "2026-09-30",
                "merchant_name": "Small software company", "amount": 22, "iso_currency_code": "USD"}, {"card": {"label": "Card"}})
            reconcile(db, conn, None, date(2026, 10, 1))
        self.assertEqual((self.subscriptions(conn)[0]["status"], str(self.subscriptions(conn)[0]["cost"])), ("active", "15.00"))
        with transaction() as db:
            store_transaction(db, conn, {"transaction_id": "4", "account_id": "card", "date": "2026-10-31",
                "merchant_name": "Small software company", "amount": 22, "iso_currency_code": "USD"}, {"card": {"label": "Card"}})
            reconcile(db, conn, None, date(2026, 11, 1))
        self.assertEqual(str(self.subscriptions(conn)[0]["cost"]), "22.00")

    def test_removed_transaction_and_pending_replacement_are_re_evaluated(self):
        conn = self.prepared()
        with transaction() as db:
            store_transaction(db, conn, {"transaction_id": "pending", "account_id": "card", "date": "2026-09-01",
                "merchant_name": "Small software company", "amount": 15, "iso_currency_code": "USD", "pending": True}, {"card": {"label": "Card"}})
            reconcile(db, conn, None, TODAY)
        self.assertEqual(self.subscriptions(conn)[0]["provider_observation"]["payment_count"], 3)
        with transaction() as db:
            db.execute("delete from keepit_private.transactions where connection_id=%s and transaction_id='0'", (conn["id"],))
            reconcile(db, conn, None, TODAY)
        self.assertEqual(len(self.subscriptions(conn)), 1)
        self.assertEqual(self.subscriptions(conn)[0]["provider_observation"]["payment_count"], 2)

    def test_recurring_outage_keeps_import_cursor_and_local_detection(self):
        conn = self.connection()
        today = date.today().replace(day=1)
        added = [{"transaction_id": str(i), "account_id": "card", "date": shift(today, i-2).isoformat(),
                  "merchant_name": "Small software company", "amount": 15, "iso_currency_code": "USD"} for i in range(3)]
        def provider(path, **kwargs):
            if path == "/accounts/get":
                return {"accounts": [{"account_id": "card", "name": "Card", "type": "credit", "balances": {"iso_currency_code": "USD"}}], "item": {}}
            if path == "/transactions/sync":
                return {"added": added, "modified": [], "removed": [], "has_more": False, "next_cursor": "saved"}
            raise PlaidError("PRODUCT_NOT_ENABLED")
        with transaction() as db:
            enqueue(db, conn["id"])
        with patch("app.worker.decrypt", return_value="token"), patch("app.worker.plaid", side_effect=provider):
            self.assertTrue(run_once())
        with transaction() as db:
            row = db.execute("select * from keepit_private.connections where id=%s", (conn["id"],)).fetchone()
            self.assertEqual(row["transaction_cursor"], "saved")
            self.assertEqual(row["sync_status"], "ready")
            self.assertEqual(db.execute("select count(*) as n from keepit_private.transactions where connection_id=%s", (conn["id"],)).fetchone()["n"], 3)
        self.assertEqual(self.subscriptions(conn)[0]["status"], "active")

    def test_migration_preserves_decisions_and_queues_existing_connections(self):
        from scripts.configure_tracking import inspect
        conn = self.prepared()
        with transaction() as db:
            reconcile(db, conn, [self.provider()], TODAY)
            db.execute("drop table keepit_private.candidate_transactions")
            db.execute("alter table keepit_private.candidates drop column source,drop column detection_key,drop column account_id,drop column last_seen_at")
            before = db.execute("select * from public.subscriptions order by id").fetchall()
            decisions = db.execute("select id,decision,subscription_id from keepit_private.candidates order by id").fetchall()
            self.assertEqual(inspect(db)[2], ["007_subscription_detection.sql"])
            sql = (Path(__file__).parents[1] / "supabase/migrations/007_subscription_detection.sql").read_text()
            db.execute("\n".join(line for line in sql.splitlines() if line.lower() not in ("begin;", "commit;")))
            self.assertEqual(before, db.execute("select * from public.subscriptions order by id").fetchall())
            self.assertEqual(decisions, db.execute("select id,decision,subscription_id from keepit_private.candidates order by id").fetchall())
            self.assertEqual(inspect(db)[2], [])
            self.assertIsNotNone(db.execute("select * from keepit_private.jobs where connection_id=%s", (conn["id"],)).fetchone())
