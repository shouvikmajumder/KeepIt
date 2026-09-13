# KeepIt web

React + TypeScript + Vite. Desktop tracking backed by FastAPI and Supabase Auth.

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

Subscriptions & bills shows classified recurring-payment candidates directly, including uncertain and
incomplete records. Keep/Dismiss updates local rows using the review response without reloading the page.
Only kept active records count toward spending; excluded transfers and debt payments are not suggested.
