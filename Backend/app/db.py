"""Server-only Supabase admin client for account lifecycle operations.

Tracking queries use psycopg through postgres.py and explicitly scope by user.
The service-role credential is never exposed to the web frontend.
"""

from functools import lru_cache

from supabase import Client, create_client

from .config import settings


@lru_cache
def get_supabase() -> Client:
    # lru_cache makes this a lazy singleton: built on first use, reused after.
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
