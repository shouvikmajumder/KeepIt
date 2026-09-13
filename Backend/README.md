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

supabase/schema.sql is for new databases only. Migrations 001–005 extend existing tracking tables.
scripts/configure_tracking.py --apply snapshots the subscriptions table and applies recognized missing
migrations atomically. See the root README for its scope and preservation checks.

Stop the old API/worker before applying migration 005, then restart with the new code. It queues connections
for classification using fresh PFCv2 evidence; existing subscription values and user decisions are preserved.
Subscriptions accept `payment_type` (`subscription`, `bill`, `unknown`); manual creation defaults to subscription.
Review accepts an optional `payment_type` (`subscription` or `bill`) and `next_renewal_date`, and returns the kept
`subscription` record alongside its ID/decision. Unclassified discoveries require a type before confirmation.
Candidate observations expose evidence labels, explanations, reason codes, category metadata, payment count,
original frequency, and classifier version. `eligible` means technically actionable and not excluded, not certain.
Missing dates can be supplied at review. Dashboard discovery counts include actionable pending candidates,
including candidates that do not yet have provisional subscription rows.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| GET /health | Process liveness |
| GET /ready | Database/schema readiness |
| GET/POST /subscriptions | List/create subscriptions |
| PATCH/DELETE /subscriptions/{id} | Update/remove a subscription |
| GET /dashboard | Monthly equivalent and upcoming renewals |
| POST /plaid/link-token, /plaid/exchange | Start and finish a browser Plaid Link connection |
| GET/DELETE /connections | List or revoke connected accounts |
| GET /subscription-candidates | List provisional recurring-payment discoveries |
| POST /subscription-candidates/{id}/review | Confirm, ignore, or match a discovery |
| DELETE /account | Revoke existing bank access and delete the account |

Interactive API documentation is at http://localhost:8000/docs. For local Plaid Sandbox development, start the
worker with `python -m app.worker` (or use `../start-plaid-dev.sh` from the repository root). Do not start it for
manual-only development; it requires Plaid settings.

## Tests

```sh
.venv/bin/python -m unittest discover -s tests -v
```

Integration tests require KEEPIT_TEST_DATABASE_URL pointing to a disposable database named keepit_test*.
They reset schemas and must never target the app database. Without it, those classes are skipped.

scripts/smoke_tracking.py --run intentionally tests the configured database with temporary users and
cleans up only those users. Add --browser to exercise the running web app in Google Chrome too.
