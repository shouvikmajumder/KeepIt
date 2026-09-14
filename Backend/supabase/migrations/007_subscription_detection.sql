begin;
alter table keepit_private.candidates
  add column source text not null default 'plaid' check (source in ('plaid','history')),
  add column detection_key text,
  add column account_id text,
  add column last_seen_at timestamptz;
update keepit_private.candidates set detection_key=stream_id;
alter table keepit_private.candidates alter column detection_key set not null;
create unique index candidates_detection_key on keepit_private.candidates(connection_id,source,detection_key);
create table keepit_private.candidate_transactions (
  candidate_id uuid not null references keepit_private.candidates(id) on delete cascade,
  transaction_id uuid not null references keepit_private.transactions(id) on delete cascade,
  primary key(candidate_id,transaction_id)
);
create index candidate_transactions_transaction on keepit_private.candidate_transactions(transaction_id);
revoke all on keepit_private.candidate_transactions from public,anon,authenticated;
-- Reimport normalized processor descriptors, and evaluate existing history.
update keepit_private.connections set transaction_cursor=null;
insert into keepit_private.jobs(connection_id) select id from keepit_private.connections
  on conflict(connection_id) do update set available_at=now(),attempts=0;
commit;
