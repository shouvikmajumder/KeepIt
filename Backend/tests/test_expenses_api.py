from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb

from db_case import DatabaseCase
from app.auth import get_current_user_id
from app.main import app
from app.postgres import transaction


class ExpenseAPI(DatabaseCase):
    def setUp(self):
        super().setUp()
        app.dependency_overrides[get_current_user_id] = lambda: str(self.owner)
        self.client = TestClient(app)
        self.bank = self.connection()
        with transaction() as db:
            db.execute("update keepit_private.connections set accounts=%s where id=%s",
                       (Jsonb([{"id": "card", "label": "Card ••1234"}]), self.bank["id"]))

    def tearDown(self):
        app.dependency_overrides.clear()
        super().tearDown()

    def add(self, transaction_id, amount, **changes):
        row = {"date": "2026-09-05", "pending": False, "hidden": False,
               "primary": "GENERAL_MERCHANDISE", **changes}
        with transaction() as db:
            return db.execute("""insert into keepit_private.transactions
                (connection_id,transaction_id,account_id,account_label,transaction_date,display_name,
                 amount,currency,pending,hidden,pfc_primary)
                values (%s,%s,'card','Card ••1234',%s,%s,%s,'USD',%s,%s,%s) returning id""",
                (self.bank["id"], transaction_id, row["date"], transaction_id, amount,
                 row["pending"], row["hidden"], row["primary"])).fetchone()["id"]

    def test_monthly_total_categories_and_pending_refunds(self):
        self.add("purchase", "20.00")
        self.add("refund", "-5.00")
        self.add("pending", "8.00", pending=True, primary="FOOD_AND_DRINK")
        self.add("transfer", "100.00", primary="TRANSFER_OUT")
        dashboard = self.client.get("/dashboard?month=2026-09").json()
        self.assertEqual(dashboard["spending_total"], "15.00")
        self.assertEqual(dashboard["categories"],
                         [{"key": "GENERAL_MERCHANDISE", "label": "Shopping", "amount": "15.00"}])
        rows = self.client.get("/expenses?month=2026-09").json()["transactions"]
        self.assertEqual({row["merchant"] for row in rows}, {"purchase", "refund", "pending"})

    def test_hide_restore_and_ownership(self):
        expense_id = self.add("purchase", "20.00")
        hidden = self.client.patch(f"/expenses/{expense_id}", json={"hidden": True})
        self.assertTrue(hidden.json()["hidden"])
        self.assertEqual(self.client.get("/dashboard?month=2026-09").json()["spending_total"], "0.00")
        self.assertEqual(len(self.client.get("/expenses?month=2026-09&visibility=hidden").json()["transactions"]), 1)
        app.dependency_overrides[get_current_user_id] = lambda: str(self.other)
        self.assertEqual(self.client.patch(f"/expenses/{expense_id}", json={"hidden": False}).status_code, 404)
