"""Inspect or upgrade the existing tracking table, with a local recovery snapshot.

Run from Backend: .venv/bin/python scripts/configure_tracking.py [--apply]
This does not create a project, reset tables, or change Supabase Auth settings.
"""
import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import psycopg
from psycopg.rows import dict_row
from app.config import settings

BASE_COLUMNS = {"id", "user_id", "name", "cost", "next_renewal_date", "created_at"}
TRACKING_COLUMNS = {"billing_interval", "currency", "status", "source", "recurrence_anchor", "user_overrides", "provider_observation"}
LINK_COLUMNS = {"connection_id", "candidate_id"}
AUTOMATIC_COLUMNS = {"hidden", "auto_detected"}


def supports_pending_review(db):
    row = db.execute("""select pg_get_constraintdef(oid) as definition
        from pg_constraint where conrelid='public.subscriptions'::regclass
        and contype='c' and conname='subscriptions_status_check'""").fetchone()
    return bool(row and "pending_review" in row["definition"])


def inspect(db):
    columns = db.execute("""select column_name, data_type, is_nullable, column_default
        from information_schema.columns where table_schema='public' and table_name='subscriptions'
        order by ordinal_position""").fetchall()
    names = {row["column_name"] for row in columns}
    private = {row["tablename"] for row in db.execute(
        "select tablename from pg_tables where schemaname='keepit_private'").fetchall()}
    if not BASE_COLUMNS <= names:
        raise RuntimeError("Expected the existing baseline subscriptions table; inspect the target before proceeding.")
    if names & TRACKING_COLUMNS and not TRACKING_COLUMNS <= names:
        raise RuntimeError("Partially applied tracking migration; manual inspection required.")
    if (private or names & LINK_COLUMNS) and not ({"connections", "candidates", "jobs"} <= private and LINK_COLUMNS <= names):
        raise RuntimeError("Partially applied connections migration; manual inspection required.")
    privileges = db.execute("""select grantee,privilege_type from information_schema.role_table_grants
        where table_schema='public' and table_name='subscriptions' order by grantee,privilege_type""").fetchall()
    pending = []
    if not TRACKING_COLUMNS <= names:
        pending.append("001_tracking.sql")
    if not LINK_COLUMNS <= names:
        pending.append("002_connections.sql")
    if any(row["grantee"] in ("anon", "authenticated") for row in privileges):
        pending.append("003_api_access.sql")
    if not TRACKING_COLUMNS <= names or not supports_pending_review(db):
        pending.append("004_pending_review.sql")
    if "payment_type" not in names:
        pending.append("005_payment_classification.sql")
    connection_columns = {row["column_name"] for row in db.execute(
        "select column_name from information_schema.columns where table_schema='keepit_private' and table_name='connections'").fetchall()}
    automatic_parts = bool(names & AUTOMATIC_COLUMNS or "transactions" in private or "transaction_cursor" in connection_columns)
    automatic_complete = (AUTOMATIC_COLUMNS <= names and "transactions" in private
                          and "transaction_cursor" in connection_columns)
    if automatic_parts and not automatic_complete:
        raise RuntimeError("Partially applied automatic spending migration; manual inspection required.")
    if not automatic_complete:
        pending.append("006_automatic_spending.sql")
    candidate_columns = {row["column_name"] for row in db.execute(
        "select column_name from information_schema.columns where table_schema='keepit_private' and table_name='candidates'").fetchall()}
    detection_columns = {"source", "detection_key", "account_id", "last_seen_at"}
    detection_complete = detection_columns <= candidate_columns and "candidate_transactions" in private
    if (candidate_columns & detection_columns or "candidate_transactions" in private) and not detection_complete:
        raise RuntimeError("Partially applied subscription detection migration; manual inspection required.")
    if not detection_complete:
        pending.append("007_subscription_detection.sql")
    return columns, privileges, pending


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Snapshot existing tracking data, then apply missing migrations")
    args = parser.parse_args()
    if not settings.database_url:
        raise RuntimeError("Set DATABASE_URL in Backend/.env first.")
    with psycopg.connect(settings.database_url, row_factory=dict_row, connect_timeout=10) as db:
        if not args.apply:
            db.execute("set transaction read only")
        db.execute("set local statement_timeout='30s'")
        db.execute("set local lock_timeout='10s'")
        columns, privileges, pending = inspect(db)
        print("Pending migrations:", ", ".join(pending) or "none")
        if not args.apply or not pending:
            return
        # Keep the snapshot and migration based on a consistent, locked table.
        db.execute("lock table public.subscriptions in access exclusive mode")
        before = db.execute("select id,user_id,name,cost,next_renewal_date,created_at from public.subscriptions order by id").fetchall()
        auth_before = db.execute("select id from auth.users order by id").fetchall()
        backup = {
            "scope": "public.subscriptions recovery snapshot; not a full Supabase backup",
            "columns": columns,
            "rows": db.execute("select * from public.subscriptions order by id").fetchall(),
            "constraints": db.execute("""select conname, pg_get_constraintdef(oid) as definition
                from pg_constraint where conrelid='public.subscriptions'::regclass""").fetchall(),
            "indexes": db.execute("select indexname,indexdef from pg_indexes where schemaname='public' and tablename='subscriptions'").fetchall(),
            "policies": db.execute("select * from pg_policies where schemaname='public' and tablename='subscriptions'").fetchall(),
            "grants": privileges,
        }
        backup_dir = Path(__file__).resolve().parents[2] / ".local" / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        path = backup_dir / f"tracking-before-migrations-{stamp}.json"
        with open(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as stream:
            json.dump(backup, stream, default=str, indent=2)
        for name in pending:
            sql = (Path(__file__).resolve().parents[1] / "supabase" / "migrations" / name).read_text()
            # The surrounding psycopg context commits all pending migrations together.
            sql = "\n".join(line for line in sql.splitlines() if line.strip().lower() not in ("begin;", "commit;"))
            db.execute(sql)
        after = db.execute("select id,user_id,name,cost,next_renewal_date,created_at from public.subscriptions order by id").fetchall()
        if before != after or auth_before != db.execute("select id from auth.users order by id").fetchall():
            raise RuntimeError("Preservation check failed; migration transaction rolled back.")
        if inspect(db)[2]:
            raise RuntimeError("Migration verification failed; transaction rolled back.")
    print(f"Applied {len(pending)} migrations; preserved {len(before)} subscriptions and {len(auth_before)} Auth users.")
    print(f"Recovery snapshot: {path}")


if __name__ == "__main__":
    try:
        main()
    except (psycopg.Error, RuntimeError) as exc:
        # Connection exceptions can contain credential-bearing URLs; don't print them.
        print(str(exc) if isinstance(exc, RuntimeError) else f"Database operation failed ({type(exc).__name__}). Check connection settings.", file=sys.stderr)
        raise SystemExit(1)
