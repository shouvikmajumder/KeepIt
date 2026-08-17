-- KeepIt — database schema (reference copy)
--
-- HOW TO APPLY: open the Supabase dashboard → SQL editor → paste this whole
-- file → Run. This file is checked into the repo so the schema is documented
-- and reviewable; the dashboard is the source of truth for what's live.

-- Each row is one subscription belonging to one user.
create table public.subscriptions (
  id                uuid primary key default gen_random_uuid(),

  -- Links the row to the signed-in user. `default auth.uid()` means the client
  -- never has to send this on insert — Postgres stamps it from the user's JWT.
  -- The foreign key + `on delete cascade` removes a user's rows if their auth
  -- account is ever deleted.
  user_id           uuid not null default auth.uid()
                      references auth.users(id) on delete cascade,

  name              text not null,
  cost              numeric(10,2) not null,     -- money: exact, 2 decimal places
  next_renewal_date date not null,
  created_at        timestamptz not null default now()
);

-- Turn on Row Level Security. Until policies exist below, this locks the table
-- to everyone — RLS denies by default, then we open up exactly what's allowed.
alter table public.subscriptions enable row level security;

-- One policy per action, all saying the same thing: a row is only yours if its
-- user_id matches the currently signed-in user (auth.uid()). This is what makes
-- each user see and touch ONLY their own subscriptions — enforced by the
-- database, not by app code.
create policy "own rows: select" on public.subscriptions
  for select using (auth.uid() = user_id);

create policy "own rows: insert" on public.subscriptions
  for insert with check (auth.uid() = user_id);

create policy "own rows: update" on public.subscriptions
  for update using (auth.uid() = user_id);

create policy "own rows: delete" on public.subscriptions
  for delete using (auth.uid() = user_id);