# KeepIt API (FastAPI)

Backend for the KeepIt app. It serves the user's subscription data. **Auth
stays on the frontend** (Supabase); this service only trusts the access-token
the app sends and scopes every query to that user.

## What it does

- Verifies the Supabase access-token (JWT, ES256 via the project's JWKS) on each request.
- Reads/writes the `subscriptions` table using the Supabase **service_role**
  key, always filtered by the authenticated `user_id`.

## Endpoints

| Method | Path                  | Description                          |
| ------ | --------------------- | ------------------------------------ |
| GET    | `/health`             | Liveness check (no auth)             |
| GET    | `/subscriptions`      | List the user's subs (soonest first) |
| POST   | `/subscriptions`      | Create a sub, returns the new row    |
| DELETE | `/subscriptions/{id}` | Delete one of the user's subs        |

## Run locally

```bash
cd Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env      # then fill in the three values from Supabase

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Open http://localhost:8000/docs for interactive API docs.

## Config (`Backend/.env`)

| Variable                     | Where to find it (Supabase dashboard)          |
| ---------------------------- | ---------------------------------------------- |
| `SUPABASE_URL`               | Settings → API → Project URL                   |
| `SUPABASE_SERVICE_ROLE_KEY`  | Settings → API → Project API keys → service_role |

Access-tokens are verified against the project's JWKS endpoint (asymmetric
ES256 keys derived from `SUPABASE_URL`), so no JWT secret is required.

`.env` is git-ignored — never commit the service_role key.
