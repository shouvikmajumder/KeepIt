# KeepIt

iPhone-first subscription tracking with manual entry and reviewed Plaid discovery.
The Expo app uses Supabase Auth and a Python/FastAPI service backed by Supabase PostgreSQL.

## Local setup

1. Use Node 24 and Python 3.13. Install `KeepIt` dependencies with `npm ci`.
2. Install `Backend/requirements.txt` in a virtual environment.
3. Copy both `.env.example` files to `.env` and supply your own configuration.
4. On a new Supabase project, run `KeepIt/supabase/schema.sql` first. On an existing project, preserve that table.
5. Apply `KeepIt/supabase/migrations/*.sql` once, in numeric order, after backing up existing data.
6. From `Backend`, run `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
7. From `Backend`, separately run `python -m app.worker` when Plaid is configured.
8. From `KeepIt`, run `npx expo run:ios` to include native Plaid code. Expo Go supports manual tracking only.

`DATABASE_URL` is now required for all tracking endpoints. Use the direct or session-pooler URL;
the transaction pooler is incompatible with the session lock used during account deletion.
Use your computer's LAN address for `EXPO_PUBLIC_API_URL` when testing on a physical iPhone.
Never put database, Plaid, encryption, or Supabase service-role secrets in `EXPO_PUBLIC_*` variables.

## What is included

- Monthly/annual USD subscriptions, editing, inactive status, and date-aware renewal estimates.
- Monthly-equivalent spending and upcoming renewals; estimates do not confirm payment.
- Two Add Subscription choices: manual entry or native bank/card linking.
- Recurring-payment review, ignoring, matching existing records, and preserving user edits.
- Verified webhooks, persistent jobs, retries, reconnects, and disconnects that retain manual records.
- Email confirmation, password recovery, session restoration, and account deletion.

## Validation

Run `npx tsc --noEmit` in `KeepIt`. Export with `npx expo export --platform ios` or `--platform web`.
Run `python -m unittest discover -s tests -v` in `Backend`.
Database tests require `KEEPIT_TEST_DATABASE_URL` pointing to a **disposable** PostgreSQL database
whose name starts with `keepit_test`. They reset test schemas. Never use your app database.
Without that variable, database cases are skipped; security and calendar tests still run.

## Release preparation

See [the release checklist](docs/release.md) for Plaid access, OAuth, email redirects, deployment,
monitoring, and device acceptance checks. No backend deployment or app submission is automatic.
Local commits can be checked with `git log --oneline`; `scripts/commit-small.sh` refuses staged
changes over 100 added/deleted lines. Stage explicit files and inspect their diff before using it.
