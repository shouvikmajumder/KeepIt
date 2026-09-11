# KeepIt API

FastAPI service for the KeepIt web app. Authenticated routes verify Supabase JWTs through JWKS.
Tracking uses DATABASE_URL through psycopg, and every user operation is scoped to its verified owner.
The Supabase service-role client is used for account administration and stays server-only.

## Local setup

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
# Copy .env.example to .env only if .env does not already exist, then configure it.
.venv/bin/python scripts/configure_tracking.py
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --no-access-log
```

Required settings: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and DATABASE_URL.
Use the existing project's direct/session-pooler PostgreSQL URL; encode password characters and enable SSL.
ALLOWED_ORIGINS defaults to the local web app's localhost and 127.0.0.1 origins on port 5173.

supabase/schema.sql is for new databases only. Migrations 001–003 extend existing tracking tables.
scripts/configure_tracking.py --apply snapshots the subscriptions table and applies recognized missing
migrations atomically. See the root README for its scope and preservation checks.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| GET /health | Process liveness |
| GET /ready | Database/schema readiness |
| GET/POST /subscriptions | List/create subscriptions |
| PATCH/DELETE /subscriptions/{id} | Update/remove a subscription |
| GET /dashboard | Monthly equivalent and upcoming renewals |
| DELETE /account | Revoke existing bank access and delete the account |

Interactive API documentation is at http://localhost:8000/docs.
The existing Plaid, connections, review, and webhook routes are retained for a later web release.
Do not start python -m app.worker for manual-only development; it requires all Plaid settings.

## Tests

```sh
.venv/bin/python -m unittest discover -s tests -v
```

Integration tests require KEEPIT_TEST_DATABASE_URL pointing to a disposable database named keepit_test*.
They reset schemas and must never target the app database. Without it, those classes are skipped.

scripts/smoke_tracking.py --run intentionally tests the configured database with temporary users and
cleans up only those users. Add --browser to exercise the running web app in Google Chrome too.
