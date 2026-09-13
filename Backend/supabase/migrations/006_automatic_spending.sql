begin;

alter table keepit_private.connections
  add column transaction_cursor text;

create table keepit_private.transactions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references keepit_private.connections(id) on delete cascade,
  transaction_id text not null,
  account_id text not null,
  account_label text not null,
  transaction_date date not null,
  authorized_date date,
  display_name text not null,
  merchant_name text,
  amount numeric(14,2) not null,
  currency text,
  pending boolean not null default false,
  pending_transaction_id text,
  pfc_primary text,
  pfc_detailed text,
  pfc_confidence text,
  payment_channel text,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id, transaction_id)
);
create index transactions_connection_date
  on keepit_private.transactions(connection_id, transaction_date desc, id desc);
create index transactions_account_date
  on keepit_private.transactions(account_id, transaction_date desc);
create index transactions_category_date
  on keepit_private.transactions(pfc_primary, transaction_date desc);

alter table public.subscriptions
  add column hidden boolean not null default false,
  add column auto_detected boolean not null default false;

-- Reclassify and backfill every existing connection with the new worker.
insert into keepit_private.jobs(connection_id)
  select id from keepit_private.connections
  on conflict(connection_id) do update set available_at=now(), attempts=0;

commit;
