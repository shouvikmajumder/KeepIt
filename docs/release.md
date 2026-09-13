# KeepIt web release preparation

The current milestone is a local desktop MVP. Deployment and browser bank linking are deferred.

## Local acceptance

- Point the web frontend and API at the same existing Supabase project.
- Confirm database migrations and grants; /ready alone is not a full permissions audit.
- Allowlist the browser authentication callback and recovery URLs in Supabase.
- Verify signup email confirmation, expired links, password recovery, and login with the changed password.
- Check automatic transaction import, totals, refunds, pending exclusions, hide/restore, recurring classification,
  manual fallback, edits, and removal confirmations.
- Verify session restoration, sign-out, API error recovery, and account deletion with designated test users.
- Use the same browser and origin for PKCE initiation and email callbacks.

## Future hosted web release

- Host the static Web/dist output with history fallback to index.html for direct route loads.
- Set public web build variables before building. Never place database, service-role, or Plaid secrets in VITE_* settings.
- Serve the frontend and API over HTTPS; configure CORS for the exact frontend origin.
- Add HTTPS authentication callbacks to Supabase and verify email delivery. Remove obsolete redirects after successful cutover.
- Back up data before schema changes. Retain additive schema changes during application rollbacks.
- Monitor API failures, readiness, and database connectivity.
- Test keyboard navigation, dialog focus, and desktop layouts at 1024px and 1440px.

## Future hosted Plaid deployment

- Configure the existing browser Plaid Link flow with its HTTPS OAuth return URL.
- Confirm Transactions and Recurring Transactions product access, first with Sandbox.
- Configure PLAID_WEBHOOK_URL as the API's public /webhooks/plaid endpoint.
- Store Plaid secrets and the stable encryption key only on the backend.
- On Render, run the static web app, API, and worker as separate services; monitor overdue jobs and failed syncs.
- Test cursor pagination, webhook retries, pending-to-posted replacement, reconnects, preservation of user edits,
  730-day retention, and disconnect cleanup.
