"""FastAPI application entry point.

Run locally with:
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
(host 0.0.0.0 so a phone on the same Wi-Fi can reach it; --reload restarts on
code changes). Interactive docs live at http://localhost:8000/docs.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import subscriptions, dashboard, plaid_link, plaid_webhook
from .plaid_client import PlaidError
from fastapi.responses import JSONResponse
from .config import settings
from .routers import connections, review, account

app = FastAPI(title="KeepIt API")

# Permissive CORS for local development. Native (iOS/Android) fetch isn't
# CORS-gated, but Expo web is — this lets the browser build call the API too.
# Tighten allow_origins to the real app origin before deploying.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """Cheap liveness check — no auth, no DB."""
    return {"status": "ok"}


app.include_router(subscriptions.router)
app.include_router(dashboard.router)
app.include_router(plaid_link.router)
app.include_router(plaid_webhook.router)
app.include_router(connections.router)
app.include_router(review.router)
app.include_router(account.router)


@app.exception_handler(PlaidError)
async def plaid_error_handler(request, exc):
    return JSONResponse(status_code=503, content={"detail": "Bank access is temporarily unavailable. Please retry."})
