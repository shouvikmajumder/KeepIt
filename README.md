# KeepIt

A desktop web app for tracking subscriptions, monthly-equivalent spending, and estimated renewals.
React + TypeScript + Vite power the frontend; FastAPI and Supabase PostgreSQL power the API.
Supabase handles email/password authentication. Tracking data is accessible through the API only.

## Run the MVP locally

Requirements: Node 20.20.1 or a compatible newer LTS release, Python 3.13, and the existing Supabase project.

1. In `Web`, run `npm ci` and configure `Web/.env` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_API_URL`.
2. In `Backend`, create `.venv` with `python3 -m venv .venv`, then run `.venv/bin/pip install -r requirements.txt`.
3. Configure `Backend/.env` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL`.
4. Configure `Web/.env` with the same project's public URL/key and `VITE_API_URL=http://localhost:8000`.
5. Inspect the tracking schema using `.venv/bin/python scripts/configure_tracking.py` from `Backend`.
6. Run `./start-dev.sh` from the repository root for manual tracking, then open **http://localhost:5173**. Ctrl-C stops both processes.

### Local Plaid Sandbox

The browser flow is ready for local Sandbox development. Apply the pending tracking migration, add
`PLAID_CLIENT_ID`, `PLAID_SECRET`, and `TOKEN_ENCRYPTION_KEY` to `Backend/.env`, and ensure the Plaid project has
Transactions plus Recurring Transactions access. Leave `PLAID_WEBHOOK_URL` blank locally; the worker performs the
initial and manually requested syncs. Run `./start-plaid-dev.sh` instead of `./start-dev.sh` to start the web app,
API, and worker together.

To run each process separately:

```sh
# Terminal 1, from Backend/
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --no-access-log

# Terminal 2, from Web/
npm run dev
```

Keep the browser origin consistent: use localhost:5173 for signup and open its email links in the same browser.
Supabase's redirect allowlist must include `http://localhost:5173/auth-callback` and
`http://localhost:5173/auth-callback?flow=recovery`. If using 127.0.0.1:5173, add its two equivalents too.
Enable email/password authentication and asymmetric JWT signing (ES256 or RS256).
Redirect configuration is a Supabase dashboard setting; a service-role key cannot change it.

## Database

SQL lives in `Backend/supabase/`. On a **new** database, run `schema.sql` before migrations 001–004.
On the existing database, do not rerun the baseline or previously applied migrations.

The inspection helper recognizes the existing baseline and complete migration states. Run it with `--apply`
to create a protected local recovery snapshot of public.subscriptions and apply missing migrations in one
transaction. It checks that original subscription fields and existing Auth user IDs are preserved.
Snapshots are in ignored `.local/backups/`; they are tracking-table snapshots, not full Supabase backups.
Partial migration states require manual inspection. Migration 001 rejects nonpositive existing costs.

Use a direct or **session-pooler** PostgreSQL URL, with SSL enabled for hosted databases. Transaction pooling
is incompatible with account deletion's session lock. Percent-encode reserved password characters in the URL.
The database password is different from the public key and service-role key.

## Current scope

- Signup, login, email confirmation, password recovery, persistent browser sessions, and sign-out.
- Add, edit, deactivate, and remove monthly/annual USD subscriptions.
- Monthly-equivalent spending and upcoming renewal estimates.
- Browser Plaid Link for US credit and depository accounts in local Sandbox development.
- Automatic provisional Plaid discoveries appear in Subscriptions; users keep or dismiss them before they affect spending totals.
- Account deletion, including revocation of any previously connected bank access.
- Dark desktop UI with keyboard-accessible forms and confirmation dialogs.

Manual tracking does not require Plaid keys, a webhook, or the worker. Local discovery does not receive remote
webhooks; that is enabled later with the public API deployment. Tracking does not charge or cancel subscriptions
with providers.

## Validation

From `Web`, run `npm run build` and `npm test`. Browser tests use installed Google Chrome, an isolated
server on port 5174, dummy credentials, and mocked APIs; they do not reach the real database.

From `Backend`, run `.venv/bin/python -m unittest discover -s tests -v`.
Database integration tests only run when `KEEPIT_TEST_DATABASE_URL` points to a disposable PostgreSQL
database named keepit_test*. They reset its schemas. Never use the existing app database for them.

For an intentional live smoke check, run `.venv/bin/python scripts/smoke_tracking.py --run --browser`
from `Backend` while the local app/API are running. This creates two temporary confirmed test users,
sends no emails, verifies real login/tracking/user isolation, and deletes only the users it created.
It requires Google Chrome and does not verify email delivery or the dashboard redirect allowlist.

See [release notes](docs/release.md) for the future hosted-web milestone.
