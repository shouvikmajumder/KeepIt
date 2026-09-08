# KeepIt release preparation

## Configure services

- Create separate test and production Supabase projects; back up existing data before migration.
- Run the baseline schema only on a new database, then migrations 001–003 once in order.
- Migration 001 intentionally rejects existing nonpositive costs. Correct invalid data before retrying it.
- Use the direct/session-pooler `DATABASE_URL`. Keep SSL enabled for hosted connections.
- Store server secrets in the hosting platform's secret store. Keep the encryption key stable;
  changing it without re-encrypting saved tokens makes existing connections unreadable.
- Request Plaid Transactions and Recurring Transactions access. Configure US coverage and Sandbox first.
- Set the public HTTPS webhook URL to `/webhooks/plaid`. The worker polls daily as a missed-event fallback.
- Confirm product access with a Sandbox Link session, recurring test data, and delivered webhooks.
  Mocked tests do not prove Plaid dashboard access or institution coverage.

## iPhone authentication and OAuth

- Add `keepit://auth-callback` and `keepit://auth-callback?flow=recovery` to Supabase's redirect allowlist.
- Configure email confirmation and an email provider. Open PKCE links on the same iPhone that requested them.
- Verify signup confirmation, expired links, password recovery, and login with the changed password.
- Set `PLAID_REDIRECT_URI` to your HTTPS bank OAuth return URL and allowlist it in Plaid.
- Set `EXPO_PUBLIC_PLAID_ASSOCIATED_DOMAIN` to that URL's hostname.
- Serve an `apple-app-site-association` file identifying your Apple Team ID and
  `com.shouvikmajumder.keepit`, with the OAuth return path authorized. Configure the Associated Domains entitlement.
- Test leaving KeepIt for a bank's app/browser and returning to the same Link session.
- Confirm the bundle identifier belongs to your Apple account before producing a distribution build.

## Build and deploy

- Use Node 24.19 and the Xcode/iOS versions supported by Expo SDK 57.
- Local native debug build: `npx expo run:ios`. Plain Expo Go cannot load Plaid's native module.
- EAS profiles are provided for `simulator`, `preview` (internal devices), and `production`.
- Set the public API/Supabase variables in the chosen EAS environment before building.
  Device builds require an HTTPS API URL and associated domain.
- Build with `eas build --platform ios --profile preview` after configuring signing. Submission is a separate step.
- Deploy the API and `python -m app.worker` as separate processes using `Backend/Dockerfile`.
  `Backend/compose.yaml` is a local smoke configuration; its port is bound to loopback.
- Terminate HTTPS at your host/load balancer and restrict CORS to actual web origins.
- Use `/health` for process liveness and `/ready` for database/migration readiness.
- Deploy migrations, then API/worker, then the updated app. The new API expects the migrations.
  To roll back application code, retain additive schema columns and restore appropriate database grants deliberately.

## Observe the service

- Alert on sustained API failures, readiness failures, and repeated worker errors.
- Check overdue jobs and connection `last_synced_at` values; a healthy API does not prove its worker is running.
- Inspect counts rather than account names, tokens, request bodies, or financial data in logs.
- A connection may be `syncing`, `ready`, `needs_reconnect`, or `error`. Missing data is not an empty completed search.
- The worker retries failures with backoff capped at one hour and reconciles successful connections daily.

## Device acceptance

- Small iPhone and large text: both chooser tiles remain usable, labels fit, and forms scroll above the keyboard.
- VoiceOver: field labels, switches, buttons, errors, and subscription details are announced clearly.
- Verify monthly/annual entry, Jan 31 and leap-day estimates, edits, inactivity, totals, and deletion confirmation.
- Test Link success/cancel, unsupported institution, delayed results, no results, and reconnect.
- Review, ignore, and match a discovery; repeat submissions and webhooks must not duplicate tracking records.
- Confirm provider updates preserve user edits and disconnect retains subscriptions as manual entries.
- Test offline/API failure states, app relaunch, sign-out, password recovery, and account deletion retries.
- Test deletion with multiple connections and a failed revocation. Retry must finish cleanup before deleting auth.

These checks require your own credentials, domains, signing, and devices. Repository tests and exports
do not establish a completed live Plaid connection or an App Store-ready signed binary.
