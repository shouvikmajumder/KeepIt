# KeepIt web release preparation

The current milestone is a local desktop MVP. Deployment and browser bank linking are deferred.

## Local acceptance

- Point the web frontend and API at the same existing Supabase project.
- Confirm database migrations and grants; /ready alone is not a full permissions audit.
- Allowlist the browser authentication callback and recovery URLs in Supabase.
- Verify signup email confirmation, expired links, password recovery, and login with the changed password.
- Check manual tracking, edits, inactive status, monthly equivalents, and removal confirmations.
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

## Later browser Plaid integration

- Integrate Plaid Link for web and configure its HTTPS OAuth return URL.
- Confirm Transactions and Recurring Transactions product access, first with Sandbox.
- Configure PLAID_WEBHOOK_URL as the API's public /webhooks/plaid endpoint.
- Store Plaid secrets and the stable encryption key only on the backend.
- Run the API and worker as separate processes; monitor overdue jobs and failed syncs.
- Restore connection management and discovery review in the web UI; test retries, reconnects,
  duplicate submissions, preservation of user edits, and disconnect retaining manual records.
