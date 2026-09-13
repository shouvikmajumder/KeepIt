"""Exercise the configured API/database using temporary, explicitly marked users.

Run from Backend with --run. Creates no emails and cleans up only users created
by this invocation. Never runs the schema-resetting integration test harness.
"""
import argparse
import os
from pathlib import Path
import secrets
import subprocess
import sys
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
from fastapi.testclient import TestClient
from app.config import settings
from app.db import get_supabase
from app.main import app
from app.postgres import transaction


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true", required=True)
    parser.add_argument("--browser", action="store_true", help="Also exercise the running local web app and API")
    args = parser.parse_args()
    admin = get_supabase().auth.admin
    created = []
    accounts = []
    with transaction() as db:
        before = {str(row["id"]) for row in db.execute("select id from auth.users").fetchall()}
    try:
        for _ in range(2):
            email = f"keepit-smoke-{uuid4().hex}@example.com"
            password = secrets.token_urlsafe(32)
            result = admin.create_user({"email": email, "password": password, "email_confirm": True,
                                        "user_metadata": {"display_name": "KeepIt smoke test", "keepit_smoke_test": True}})
            created.append(result.user.id)
            response = httpx.post(settings.supabase_url + "/auth/v1/token?grant_type=password",
                headers={"apikey": settings.supabase_service_role_key},
                json={"email": email, "password": password}, timeout=20)
            if response.status_code != 200:
                raise RuntimeError(f"Test-user login failed: HTTP {response.status_code}")
            accounts.append((email, password, {"Authorization": "Bearer " + response.json()["access_token"]}))
        with TestClient(app) as client:
            assert client.get("/ready").status_code == 200
            assert client.get("/subscriptions").status_code == 401
            payload = {"name": "Smoke monthly", "cost": "12.00", "billing_interval": "monthly", "currency": "USD", "next_renewal_date": "2027-01-31"}
            first = client.post("/subscriptions", headers=accounts[0][2], json=payload)
            assert first.status_code == 201, f"Create failed: HTTP {first.status_code}"
            sid = first.json()["id"]
            annual = client.post("/subscriptions", headers=accounts[0][2], json={**payload, "name": "Smoke annual", "cost": "120.00", "billing_interval": "annual"})
            assert annual.status_code == 201
            assert client.get("/dashboard", headers=accounts[0][2]).json()["subscription_monthly_estimate"] == "22.00"
            assert client.get("/subscriptions", headers=accounts[1][2]).json() == []
            assert client.patch(f"/subscriptions/{sid}", headers=accounts[1][2], json=payload).status_code == 404
            assert client.delete(f"/subscriptions/{sid}", headers=accounts[1][2]).status_code == 204
            edited = client.patch(f"/subscriptions/{sid}", headers=accounts[0][2], json={**payload, "status": "inactive"})
            assert edited.status_code == 200
            assert client.get("/dashboard", headers=accounts[0][2]).json()["subscription_monthly_estimate"] == "10.00"
            assert client.delete(f"/subscriptions/{sid}", headers=accounts[0][2]).status_code == 204
            assert client.delete(f"/subscriptions/{annual.json()['id']}", headers=accounts[0][2]).status_code == 204
            print("PASS: live login, JWT verification, database readiness, CRUD, totals, and user isolation")
        if args.browser:
            root = Path(__file__).resolve().parents[2]
            subprocess.run(["node", "scripts/smoke-live.mjs"], cwd=root / "Web", check=True,
                env={**os.environ, "KEEPIT_SMOKE_EMAIL": accounts[0][0], "KEEPIT_SMOKE_PASSWORD": accounts[0][1]})
    finally:
        for user_id in created:
            admin.delete_user(user_id)
        with transaction() as db:
            remaining = {str(row["id"]) for row in db.execute("select id from auth.users").fetchall()}
        assert before <= remaining, "An existing user is missing"
        assert not set(created) & remaining, "Temporary test users remain"
        print("Temporary test users removed; existing users preserved.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Live smoke check failed ({type(exc).__name__}). No credentials printed.", file=sys.stderr)
        raise SystemExit(1)
