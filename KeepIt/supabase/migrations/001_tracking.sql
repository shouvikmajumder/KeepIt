-- Run once after schema.sql. Defaults preserve all existing subscriptions.
begin;
alter table public.subscriptions
  add column billing_interval text not null default 'monthly'
    check (billing_interval in ('monthly', 'annual')),
  add column currency text not null default 'USD' check (currency = 'USD'),
  add column status text not null default 'active'
    check (status in ('active', 'inactive')),
  add column source text not null default 'manual'
    check (source in ('manual', 'plaid')),
  add column recurrence_anchor date,
  add column user_overrides jsonb not null default '{}',
  add column provider_observation jsonb not null default '{}';
update public.subscriptions set recurrence_anchor = next_renewal_date;
alter table public.subscriptions alter column recurrence_anchor set not null;
alter table public.subscriptions add constraint positive_cost check (cost > 0);
create index subscriptions_owner on public.subscriptions(user_id);
commit;
