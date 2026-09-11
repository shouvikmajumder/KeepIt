"""Integration tests use only an explicitly supplied disposable test database."""
import os
import unittest
from pathlib import Path
from uuid import uuid4
import psycopg
from psycopg.conninfo import conninfo_to_dict
from psycopg.types.json import Jsonb

# Dummy credentials ensure tests never reach a real Supabase project.
os.environ["SUPABASE_URL"] = "https://keepit-test.invalid"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "test-only"
from app.config import settings
from app.postgres import transaction


class DatabaseCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        url = os.environ.get("KEEPIT_TEST_DATABASE_URL")
        if not url:
            raise unittest.SkipTest("Set KEEPIT_TEST_DATABASE_URL to a disposable database named keepit_test*")
        if not conninfo_to_dict(url).get("dbname", "").startswith("keepit_test"):
            raise RuntimeError("Refusing to reset a database not named keepit_test*")
        settings.database_url = url
        with transaction() as db:
            db.execute("drop schema if exists keepit_private cascade; drop schema if exists auth cascade")
            db.execute("drop table if exists public.subscriptions cascade; create schema auth")
            db.execute("create table auth.users(id uuid primary key)")
            db.execute("create function auth.uid() returns uuid language sql as 'select null::uuid'")
            for role in ("anon", "authenticated"):
                if not db.execute("select 1 from pg_roles where rolname=%s", (role,)).fetchone():
                    db.execute(psycopg.sql.SQL("create role {}").format(psycopg.sql.Identifier(role)))
            root = Path(__file__).resolve().parents[1] / "supabase"
            db.execute((root / "schema.sql").read_text())
            for migration in sorted((root / "migrations").glob("*.sql")):
                db.execute(migration.read_text())

    def setUp(self):
        self.owner, self.other = uuid4(), uuid4()
        with transaction() as db:
            db.execute("insert into auth.users values (%s),(%s)", (self.owner, self.other))

    def tearDown(self):
        with transaction() as db:
            db.execute("delete from auth.users where id in (%s,%s)", (self.owner, self.other))

    def connection(self):
        with transaction() as db:
            return db.execute("""insert into keepit_private.connections(user_id,item_id,token_ciphertext,exchange_hash)
                values (%s,%s,'encrypted-test-token',%s) returning *""", (self.owner, str(uuid4()), str(uuid4()))).fetchone()

    def candidate(self, connection, **changes):
        data = {"name": "Netflix", "cost": "15.00", "currency": "USD", "billing_interval": "monthly",
                "next_renewal_date": "2026-10-01", "eligible": True, "reason": None, **changes}
        with transaction() as db:
            return db.execute("""insert into keepit_private.candidates(connection_id,stream_id,observation)
                values (%s,%s,%s) returning id""", (connection["id"], str(uuid4()), Jsonb(data))).fetchone()["id"]
