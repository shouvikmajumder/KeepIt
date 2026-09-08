begin;
-- This schema is never exposed through Supabase's client-facing Data API.
create schema if not exists keepit_private;
revoke all on schema keepit_private from public, anon, authenticated;
create table keepit_private.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null unique,
  token_ciphertext text not null,
  exchange_hash text not null unique,
  institution_id text,
  institution_name text not null default 'Connected account',
  accounts jsonb not null default '[]',
  sync_status text not null default 'syncing',
  last_synced_at timestamptz,
  error_code text,
  created_at timestamptz not null default now()
);
create index connections_owner on keepit_private.connections(user_id);
create table keepit_private.candidates (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references keepit_private.connections(id) on delete cascade,
  stream_id text not null,
  observation jsonb not null,
  decision text not null default 'pending' check (decision in ('pending','ignored','confirmed')),
  subscription_id uuid references public.subscriptions(id) on delete set null,
  unique (connection_id, stream_id)
);
alter table public.subscriptions
  add column connection_id uuid references keepit_private.connections(id) on delete set null,
  add column candidate_id uuid unique references keepit_private.candidates(id) on delete set null;
create table keepit_private.jobs (
  connection_id uuid primary key references keepit_private.connections(id) on delete cascade,
  available_at timestamptz not null default now(),
  attempts integer not null default 0
);
-- Row locks held during each transaction serialize workers, disconnects, and reviews.
create index jobs_due on keepit_private.jobs(available_at);
commit;
