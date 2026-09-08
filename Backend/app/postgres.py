"""Transactions for operations that must either finish together or not at all."""
from contextlib import contextmanager
from fastapi import HTTPException
import psycopg
from psycopg.rows import dict_row
from .config import settings


@contextmanager
def transaction():
    if not settings.database_url:
        raise HTTPException(503, "Bank connections are not configured yet.")
    with psycopg.connect(settings.database_url, row_factory=dict_row, connect_timeout=10) as conn:
        yield conn


def owned_connection(db, connection_id, user_id):
    row = db.execute("""select * from keepit_private.connections
        where id=%s and user_id=%s for update""", (connection_id, user_id)).fetchone()
    if not row:
        raise HTTPException(404, "Connection not found")
    return row


def enqueue(db, connection_id):
    db.execute("""insert into keepit_private.jobs(connection_id) values (%s)
        on conflict(connection_id) do update set available_at=now(), attempts=0""", (connection_id,))
