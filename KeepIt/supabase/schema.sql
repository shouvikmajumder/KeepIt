create table public.subscriptions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid()
                      references auth.users(id) on delete cascade,
  name              text not null,
  cost              numeric(10,2) not null,     
  next_renewal_date date not null,
  created_at        timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "own rows: select" on public.subscriptions
  for select using (auth.uid() = user_id);

create policy "own rows: insert" on public.subscriptions
  for insert with check (auth.uid() = user_id);

create policy "own rows: update" on public.subscriptions
  for update using (auth.uid() = user_id);

create policy "own rows: delete" on public.subscriptions
  for delete using (auth.uid() = user_id);