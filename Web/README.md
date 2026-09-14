# KeepIt web

React + TypeScript + Vite. Connected-account spending and recurring tracking backed by FastAPI and Supabase Auth.

```sh
npm ci
# Copy .env.example to .env if needed and set the public configuration.
npm run dev
```

Open http://localhost:5173. The API runs separately on port 8000, or start both with `../start-dev.sh`.
Only public values belong in VITE_* variables. Service-role and database credentials belong in the backend.

`npm run build` typechecks and creates dist/. `npm test` runs isolated Playwright tests using installed
Google Chrome and dummy services on port 5174. These tests never call your real Supabase project.

Authentication callbacks must be allowlisted in Supabase. See the root README for exact URLs and database setup.

Subscriptions is the authenticated homepage. Strong monthly and annual patterns appear automatically with
payment-history evidence, account labels, and their own monthly estimate. Bills and older untyped saved payments
are separate sections. Background polling updates detected results without manual confirmation or refresh.
Spending remains a secondary page with calendar-month expense, account, and category filters. Pending charges
remain visible but do not affect totals. Imported rows can be hidden and restored.
