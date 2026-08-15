# Subscription Tracker — System Design

**Status:** Draft v2
**Last updated:** August 2026

---

## 1. Overview

A mobile app that tells a user what recurring services they pay for, when the next
charge lands, and when a price changes.

Subscriptions enter the system via **Plaid** — inferred from bank transactions and
confirmed by the user. There is no manual entry path. The value of the app is automatic
detection; requiring manual input defeats that purpose.

### Non-goals (v1)

- Manual subscription entry
- Cancelling subscriptions on the user's behalf
- Budgeting or spend categorization beyond subscriptions
- Multi-user / household sharing
- Non-US institutions

---

## 2. Architecture

```
┌──────────────────────────────────────────┐
│  React Native + Expo (dev build)         │
│  · TanStack Query + persisted cache      │
│  · expo-notifications (local schedule)   │
│  · supabase-js  → auth only              │
│  · Plaid Link native SDK                 │
└──────────┬─────────────────┬─────────────┘
           │                 │
    JWT    │                 │  email/password, OAuth
           ▼                 ▼
┌────────────────────┐  ┌──────────────────┐
│  FastAPI           │  │ Supabase Auth    │
│  · JWT verify      │  │ (GoTrue)         │
│  · REST API        │  │ · issues JWT     │
│  · Plaid client    │  │ · refresh/rotate │
│  · webhook intake  │  │ · OAuth, MFA     │
└─────┬──────────┬───┘  └────────┬─────────┘
      │          │               │
      │          │ enqueue       │ owns auth.users
      │          ▼               │
      │   ┌─────────────┐        │
      │   │ Worker      │        │
      │   │ SKIP LOCKED │        │
      │   └──────┬──────┘        │
      ▼          ▼               ▼
┌──────────────────────────────────────────┐
│  Postgres (Supabase-hosted)              │
│  RLS deny-all · FastAPI bypasses         │
└──────────────────────────────────────────┘
                    ▲
                    │  webhooks + REST
              ┌─────┴──────┐
              │  Plaid API │
              └────────────┘
```

### Component responsibilities

| Component | Owns |
|---|---|
| React Native client | UI, local notification scheduling, offline cache |
| Supabase Auth | Identity, sessions, token refresh, OAuth providers |
| FastAPI | All business logic, Plaid credentials, authorization |
| Worker | Transaction sync, detection, notification fan-out |
| Postgres | Persistence; RLS as a backstop, not primary authz |
| Plaid | Bank connectivity, transaction data |

---

## 3. Authentication & Authorization

### Flow

1. Client authenticates directly against Supabase Auth. FastAPI is not involved.
2. Supabase returns an access token (JWT) + refresh token. `supabase-js` persists and
   auto-refreshes them.
3. Client sends the JWT to FastAPI as `Authorization: Bearer <token>`.
4. FastAPI verifies the signature **locally** against Supabase's JWKS endpoint
   (`/auth/v1/.well-known/jwks.json`), with cached public keys. Asymmetric signing
   (ES256), not a shared HS256 secret.
5. The `sub` claim is the user ID for the request.

FastAPI never calls Supabase to validate a token. Verification is in-process.
Claims checked: signature, `exp`, `aud`, issuer.

### Authorization model

Authorization lives in the application layer, in a repository pattern where every read
takes the user ID as a required argument. This makes forgetting the scope a type error
rather than a silent data leak.

**RLS is still enabled on every table** — with no permissive policies for `anon` or
`authenticated`. This is not optional:

> The React Native bundle ships with the Supabase **anon key**, which is publicly
> extractable and grants PostgREST access. Any table without RLS is world-readable.
> Deny-by-default RLS closes this even though FastAPI is the intended API layer.

FastAPI connects with a role that bypasses RLS. A CI test asserts
`rowsecurity = true` for every table in `public`.

### Table ownership

Supabase Auth owns `auth.users`. We never write to it. Our `public.profiles` table
references it with `ON DELETE CASCADE`. Alembic is scoped to `public` only, with an
`include_object` filter so autogenerate cannot touch Supabase-internal schemas.

---

## 4. Data Model

Three distinct concerns, deliberately not collapsed into one table.

### `plaid_items`
Bank connections. **Server-only** — never reachable by the client.

| Column | Notes |
|---|---|
| `id` | PK |
| `user_id` | FK → profiles |
| `access_token_encrypted` | Plaid credential, encrypted at rest |
| `item_id` | Plaid's item identifier |
| `cursor` | `/transactions/sync` position |
| `status` | `healthy` \| `login_required` \| `pending_expiration` \| `revoked` |
| `institution_name` | Display only |

### `plaid_transactions`
Raw, immutable, append-only. Keyed on Plaid's `transaction_id`.

Stores `date`, `name`, `merchant_name`, `amount`, `pending`, `iso_currency_code`,
`personal_finance_category`.

### `detected_streams`
Output of the detection pipeline. Probabilistic — not shown as fact.

Stores `normalized_merchant`, `interval_type`, `interval_days_median`,
`amount_current`, `occurrence_count`, `confidence`, `next_expected_date`,
`status` (`candidate` | `confirmed` | `dismissed`).

### `subscriptions`
The only table the UI reads from. User-confirmed truth.

| Column | Notes |
|---|---|
| `id` | PK |
| `user_id` | FK |
| `detected_stream_id` | Nullable — null for manual entries |
| `name` | User-editable |
| `anchor_date` | First known charge |
| `interval_unit` / `interval_count` | e.g. `month` / 1 |
| `amount` | `NUMERIC(12,2)` — never float |
| `currency` | |
| `reminder_lead_days` | |
| `timezone` | IANA, e.g. `America/New_York` |

### `subscription_amount_history`
Append-only record of price changes. Powers the highest-value feature in the app:
*"Netflix went from $17.99 to $19.99."*

### `sync_jobs`
Queue table. `type`, `payload`, `status`, `attempts`, `run_after`, `locked_at`.

### Key modeling decisions

**Renewal dates are computed, not stored.** `next_renewal` is derived from
`anchor_date + interval` at read time. Never a mutable column updated by a nightly job.

Rationale: a batch job that rewrites dates silently corrupts every row when it fails,
and `date + interval '1 month'` accumulates drift. A subscription anchored on Jan 31
should renew Feb 28, Mar 31, Apr 30 — recomputing from the anchor gets this right;
incrementing does not.

**Money is `NUMERIC`, mapped to Python `Decimal`.** Floats are not permitted anywhere
in the money path.

---

## 5. Plaid Integration

### Link flow

| Step | Where | Call |
|---|---|---|
| 1 | FastAPI | `/link_token/create` → short-lived `link_token` |
| 2 | Client | Plaid Link native SDK → user authenticates → `public_token` |
| 3 | FastAPI | `/item/public_token/exchange` → `access_token` |
| 4 | FastAPI | Store encrypted, enqueue initial sync job |

The `public_token` is single-use and expires in 30 minutes — its only purpose is to be
safe to pass through the client. The `access_token` never leaves the server.

**Expo note:** Plaid on React Native uses the native SDK, not a WebView. Requires a
config plugin and a dev build. It will not run in Expo Go.

### Transaction sync

Use `/transactions/sync` with a stored cursor — not `/transactions/get` with date
ranges. Handle the `has_more` pagination loop and the `removed[]` array.

**Pull the full available history (up to 24 months), not 90 days.** A 90-day window
cannot detect annual subscriptions, which is a correctness failure against the core
premise of the app.

Gotchas:
- Plaid's sign convention is inverted — a **positive** amount means money left a
  checking account.
- Transaction IDs can change on `pending` → `posted`. Dedupe on Plaid's stable ID.
- Ignore refunds and pending rows during detection.

### Webhooks

`POST /webhooks/plaid` is publicly reachable, so **signature verification is mandatory,
not a follow-up.** Verify the `Plaid-Verification` JWT against Plaid's JWKS
(`/webhook_verification_key/get`) before touching the payload.

Handler writes a `sync_jobs` row and returns `200` immediately. No processing inline.

Webhooks handled:

| Webhook | Action |
|---|---|
| `SYNC_UPDATES_AVAILABLE` | Enqueue incremental sync |
| `ITEM_LOGIN_REQUIRED` | Mark item degraded, notify user, prompt Link update mode |
| `PENDING_EXPIRATION` | Same, proactively |
| `ITEM_ERROR` | Mark item, log, surface if persistent |

Access tokens are **not permanent**. Password changes and MFA re-enrollment break them.
Without a Link update-mode flow, the app silently stops updating and the user never
finds out.

### Build-vs-buy

Evaluate `/transactions/recurring/get` in Sandbox before writing custom detection. It
returns detected streams directly. Limits: needs 2+ occurrences, US/CA only, separately
enabled, weakest on annual cycles. Likely outcome is using it as a first pass with our
own rules layered on for what it misses.

---

## 6. Detection Pipeline

Lives in `services/detection.py` as **pure functions** —
`list[Transaction] -> list[DetectedStream]`. No database imports, no Plaid imports.
This is the most bug-prone code in the app; keeping it pure means unit tests against
handcrafted transaction sequences with nothing stood up.

**Step 1 — Normalize merchant names.**
Raw descriptors vary per charge (`NETFLIX.COM 866-579-7172 CA` vs `Netflix`). Prefer
Plaid's `merchant_name`; fall back to stripping digits, phone patterns, `*` prefixes,
and trailing state codes.

**Step 2 — Group by normalized merchant.**

**Step 3 — Test for rhythm.**
Compute gaps between consecutive charges; take the median and check variance.
Monthly ≈ 28–33 days, weekly ≈ 7±1, annual ≈ 365±5. For monthly, a stable *day of
month* is a stronger signal than day-counting.

**Step 4 — Test amount stability.**
Do not require identical amounts. Accept near-identical **or** a step change that then
holds — that step change *is* a price increase, the most valuable event to surface.
Reject wandering amounts on a regular cadence (utility bills): recurring, not a
subscription.

**Step 5 — Score.**
Occurrence count dominates. 1 charge → nothing. 2 → weak. 3+ with consistent gap →
strong.

**Step 6 — Confirm with the user.**
Detection is probabilistic and will produce both false positives (rent transfers) and
false negatives (annual renewals). Candidates go to a review screen; the user confirms,
edits, or dismisses. Dismissals are remembered and never re-suggested.

Only confirmed streams become `subscriptions`.

---

## 7. Background Jobs

**Queue:** a `sync_jobs` table drained by a worker using
`SELECT ... FOR UPDATE SKIP LOCKED`. No Redis, no extra service, safe across multiple
worker instances. Attempt counts, exponential backoff via `run_after`, dead-letter
state after N failures.

**Job types:** `initial_sync`, `incremental_sync`, `run_detection`,
`schedule_notifications`.

**Scheduling:** jobs are bucketed by the user's local hour, not UTC midnight. A global
midnight batch sends "renews today" alerts at 7pm the previous day for a Philadelphia
user.

**Observability:** every job run writes an outcome row. Alert on *no successful run in
36 hours*. A silently-failing scheduled job is the single most likely failure mode in
this design.

---

## 8. Notifications

Local and remote notifications are different mechanisms and both are needed.

**Local** (`expo-notifications`) — scheduled on-device by the OS. Does **not** go
through APNs/FCM. Used for renewal reminders.

> iOS caps pending local notifications at **64 per app**, silently dropping the rest.
> Schedule only the next 1–2 per subscription and reconcile on every app foreground.

**Remote** (APNs/FCM) — for server-detected events the device cannot know about:
price changes, trial expiry, bank connection needing re-auth.

---

## 9. Stack

| Concern | Choice |
|---|---|
| API | FastAPI |
| ORM | SQLAlchemy 2.0 async (typed `select()`) |
| Driver | asyncpg — session-mode pooler, or `statement_cache_size=0` |
| Migrations | Alembic, from day one |
| Validation | Pydantic v2 |
| HTTP | `httpx.AsyncClient` |
| DB + Auth | Supabase |
| Hosting | Fly.io / Railway — API and worker as two processes, one image |

**Plaid SDK note:** the official Python client is synchronous. Calling it from `async def`
blocks the event loop. Call Plaid's REST API directly with `httpx` — it's ~5 endpoints,
and you get real timeout and retry control.

```
app/
  api/routes/        # thin: parse, authorize, delegate
  core/              # config, JWT verification, deps
  db/models/         # SQLAlchemy
  schemas/           # Pydantic
  services/
    plaid_client.py
    detection.py     # pure functions, no I/O
    sync.py
  workers/
    queue.py
    tasks.py
```

---

## 10. Build Order

| Phase | Scope |
|---|---|
| 1 | Supabase Auth + FastAPI JWT verification. Deny-all RLS. Plaid Sandbox: Link flow, `/transactions/sync`, raw transaction storage. |
| 2 | Detection pipeline against Sandbox data. Review/confirm UI. Confirmed streams → `subscriptions`. |
| 3 | Local notification scheduling + foreground reconciliation. Background worker + `sync_jobs` queue. |
| 4 | Webhook intake (signature verification). Link update mode for expired tokens. Incremental sync. |
| 5 | Price-change tracking (`subscription_amount_history`). Remote push for price changes + bank re-auth alerts. |
| 6 | Trial expiry detection + remote push. |
| 7 | Plaid production application. |

Phases 1–2 together ship a usable app: link your bank, see your subscriptions automatically detected and confirmed.

---

## 11. Open Questions

- Does `/transactions/recurring/get` cover enough to skip custom detection?
- Account deletion: cascade must also call Plaid `/item/remove`. Compliance requirement.
- Multi-currency — defer, but `currency` is in the schema now to avoid a migration later.
- Do we surface variable recurring bills (utilities) as a separate category, or drop them?
