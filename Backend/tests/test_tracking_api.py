from datetime import date
from fastapi.testclient import TestClient
from db_case import DatabaseCase
from app.main import app
from app.auth import get_current_user_id
from app.postgres import transaction


class TrackingAPI(DatabaseCase):
    def setUp(self):
        super().setUp()
        app.dependency_overrides[get_current_user_id] = lambda: str(self.owner)
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        super().tearDown()

    def create(self, **changes):
        result = self.client.post("/subscriptions", json={"name": "Netflix", "cost": "12.00",
            "next_renewal_date": "2026-01-31", "billing_interval": "monthly", **changes})
        self.assertEqual(result.status_code, 201, result.text)
        return result.json()

    def test_create_edit_and_monthly_equivalent(self):
        sub = self.create()
        self.create(name="Annual", cost="120", billing_interval="annual")
        result = self.client.get("/dashboard?today=2026-02-01").json()
        self.assertEqual(result["monthly_equivalent"], "22.00")
        self.assertEqual(result["active_count"], 2)
        payload = {key: sub[key] for key in ("name", "cost", "billing_interval", "currency")}
        payload.update(next_renewal_date="2026-02-28", status="active")
        edited = self.client.patch(f"/subscriptions/{sub['id']}?today=2026-02-01", json=payload)
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertEqual(edited.json()["recurrence_anchor"], "2026-01-31")
        payload["status"] = "inactive"
        self.client.patch(f"/subscriptions/{sub['id']}?today=2026-02-01", json=payload)
        self.assertEqual(self.client.get("/dashboard").json()["monthly_equivalent"], "10.00")

    def test_ownership_and_validation(self):
        sub = self.create()
        app.dependency_overrides[get_current_user_id] = lambda: str(self.other)
        self.assertEqual(self.client.get("/subscriptions").json(), [])
        payload = {key: sub[key] for key in ("name", "cost", "billing_interval", "currency", "next_renewal_date")}
        self.assertEqual(self.client.patch(f"/subscriptions/{sub['id']}", json=payload).status_code, 404)
        self.client.delete(f"/subscriptions/{sub['id']}")
        with transaction() as db:
            self.assertIsNotNone(db.execute("select id from public.subscriptions where id=%s", (sub["id"],)).fetchone())
        payload["user_id"] = str(self.owner)
        self.assertEqual(self.client.post("/subscriptions", json=payload).status_code, 422)

    def test_public_role_cannot_bypass_provider_field_validation(self):
        with transaction() as db:
            permissions = db.execute("select has_table_privilege('authenticated','public.subscriptions','UPDATE') as allowed").fetchone()
            self.assertFalse(permissions["allowed"])

    def test_payment_type_is_editable_and_older_clients_preserve_it(self):
        sub = self.create(name="Electricity", payment_type="bill")
        self.assertEqual(sub["payment_type"], "bill")
        payload = {key: sub[key] for key in ("name", "cost", "billing_interval", "currency", "next_renewal_date")}
        response = self.client.patch(f"/subscriptions/{sub['id']}", json=payload)
        self.assertEqual(response.json()["payment_type"], "bill")
        payload["payment_type"] = "subscription"
        self.assertEqual(self.client.patch(f"/subscriptions/{sub['id']}", json=payload).json()["payment_type"], "subscription")
        payload["payment_type"] = "transfer"
        self.assertEqual(self.client.patch(f"/subscriptions/{sub['id']}", json=payload).status_code, 422)
