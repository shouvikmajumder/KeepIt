-- Existing user decisions and financial values are unchanged.
begin;
alter table public.subscriptions add column payment_type text not null default 'unknown'
    check (payment_type in ('subscription', 'bill', 'unknown'));
-- Old observations lack evidence. Fetch fresh streams through the normal worker.
insert into keepit_private.jobs(connection_id) select id from keepit_private.connections
    on conflict(connection_id) do update set available_at=now(), attempts=0;
commit;
