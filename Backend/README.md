# KeepIt API

FastAPI service for the KeepIt web app. Authenticated routes verify Supabase JWTs through JWKS.
Spending and recurring tracking use DATABASE_URL through psycopg, and every user operation is scoped to its verified owner.
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

supabase/schema.sql is for new databases only. Migrations 001–007 extend existing tracking tables.
scripts/configure_tracking.py --apply snapshots the subscriptions table and applies recognized missing
migrations atomically. See the root README for its scope and preservation checks.

Stop the old API/worker before applying migration 007, then restart with the new code. It queues connections
for transaction backfill and fresh PFCv2 evidence; existing subscription values and decisions are preserved.
Subscriptions accept `payment_type` (`subscription`, `bill`, `unknown`); manual creation defaults to subscription.
Strong recurring matches are added automatically. Uncertain candidates remain internal and do not block the
transaction import. Imported expenses and recurring items support reversible hide and restore controls.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| GET /health | Process liveness |
| GET /ready | Database/schema readiness |
| GET/POST /subscriptions | List/create subscriptions |
| PATCH/DELETE /subscriptions/{id} | Update/remove a subscription |
| PATCH /subscriptions/{id}/visibility | Hide/restore using only a `hidden` boolean, preserving provider prices and dates |
| GET /dashboard?month=YYYY-MM | Posted spending, categories, comparison, and recurring estimates |
| GET /expenses | Paginated expenses with month, account, category, and visibility filters |
| PATCH /expenses/{id} | Hide or restore an imported expense |
| POST /plaid/link-token, /plaid/exchange | Start and finish a browser Plaid Link connection |
| GET/DELETE /connections | List or revoke connected accounts |
| DELETE /account | Revoke existing bank access and delete the account |

Interactive API documentation is at http://localhost:8000/docs. For local Plaid Sandbox development, start the
worker with `python -m app.worker` (or use `../start-plaid-dev.sh` from the repository root). Do not start it for
manual-only development; it requires Plaid settings.

Subscription responses include optional `detection` metadata: `source` (`plaid` or `history`), `confidence`
(`strong`), `payment_count`, and `reason_codes`. Internal evidence and transaction references stay private.
Run `scripts/preview_detection.py` with the virtualenv Python for a read-only aggregate preview.

## Tests

```sh
.venv/bin/python -m unittest discover -s tests -v
```

Integration tests require KEEPIT_TEST_DATABASE_URL pointing to a disposable database named keepit_test*.
They reset schemas and must never target the app database. Without it, those classes are skipped.

scripts/smoke_tracking.py --run intentionally tests the configured database with temporary users and
cleans up only those users. Add --browser to exercise the running web app in Google Chrome too.
