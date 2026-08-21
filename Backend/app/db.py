"""The one Supabase client the backend uses to reach Postgres.

It authenticates with the service_role key, which bypasses Row Level Security.
That's a deliberate trade: the backend gets full table access, but in exchange
every query MUST filter by the authenticated user_id itself (see the routers).
The RLS policies in supabase/schema.sql remain as defense-in-depth.
"""

from functools import lru_cache

from supabase import Client, create_client

from .config import settings


@lru_cache
def get_supabase() -> Client:
    # lru_cache makes this a lazy singleton: built on first use, reused after.
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
