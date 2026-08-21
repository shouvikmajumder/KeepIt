"""Turning the app's access-token into a trusted user_id.

The Expo app keeps its Supabase auth session on-device and sends the session's
access-token (a JWT) as `Authorization: Bearer <token>` on every request. We
verify that token's signature here so we can trust the `sub` claim (the Supabase
user id). Any endpoint that depends on `get_current_user_id` is therefore
automatically protected: no valid token, no access.

This Supabase project uses **asymmetric signing keys** (ES256), so we verify
against the project's public keys published at the JWKS endpoint — not a shared
secret. `PyJWKClient` fetches those keys once, caches them, and selects the right
one by the token's `kid` (so key rotation keeps working).
"""

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings

# Pulls the "Authorization: Bearer <token>" header. auto_error=False lets us
# raise our own 401 with a clear message instead of FastAPI's default.
_bearer = HTTPBearer(auto_error=False)

# Supabase publishes its Auth public keys here (public endpoint, no apikey).
# The client caches fetched keys, so this is one network call, not one per request.
_jwks_client = jwt.PyJWKClient(f"{settings.supabase_url}/auth/v1/.well-known/jwks.json")


def get_current_user_id(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    try:
        # Pick the public key that matches this token's `kid`, then verify the
        # signature, expiry, and audience. Allow ES256 (current) and RS256 so a
        # future key-type rotation still verifies.
        signing_key = _jwks_client.get_signing_key_from_jwt(creds.credentials)
        payload = jwt.decode(
            creds.credentials,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
        )
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token missing subject")
    return user_id
