create extension if not exists pgcrypto;

drop table if exists public.usage_logs cascade;

create table public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(),
  used_5h integer not null check (used_5h >= 0),
  limit_5h integer not null check (limit_5h > 0),
  used_7d integer not null check (used_7d >= 0),
  limit_7d integer not null check (limit_7d > 0),
  created_at timestamptz not null default now()
);

create index if not exists usage_logs_user_logged_at_idx
  on public.usage_logs (user_id, logged_at desc);

alter table public.usage_logs enable row level security;

create policy "usage_logs_select_own"
  on public.usage_logs
  for select
  using (auth.uid() = user_id);

create policy "usage_logs_insert_own"
  on public.usage_logs
  for insert
  with check (auth.uid() = user_id);

create policy "usage_logs_update_own"
  on public.usage_logs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "usage_logs_delete_own"
  on public.usage_logs
  for delete
  using (auth.uid() = user_id);
