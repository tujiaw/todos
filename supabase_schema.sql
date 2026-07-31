-- ==========================================
-- Supabase Schema for Daily Todo App (每日待办)
-- Copy and run this SQL script in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/cywbnbvverbdjbbpvsid/sql/new
-- ==========================================

-- 1. Create todo_categories table
create table if not exists public.todo_categories (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  bg_class text not null,
  text_class text not null,
  border_class text not null,
  is_default boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for todo_categories
alter table public.todo_categories enable row level security;

-- Drop old policies if existing to avoid conflict
drop policy if exists "Users can view categories" on public.todo_categories;
drop policy if exists "Users can insert categories" on public.todo_categories;
drop policy if exists "Users can update categories" on public.todo_categories;
drop policy if exists "Users can delete categories" on public.todo_categories;

-- Create RLS policies for todo_categories
create policy "Users can view categories" on public.todo_categories
  for select using (auth.uid() = user_id or user_id is null or is_default = true);

create policy "Users can insert categories" on public.todo_categories
  for insert with check (auth.uid() = user_id);

create policy "Users can update categories" on public.todo_categories
  for update using (auth.uid() = user_id);

create policy "Users can delete categories" on public.todo_categories
  for delete using (auth.uid() = user_id);


-- 2. Create todo_tasks table
create table if not exists public.todo_tasks (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text,
  date text not null,
  completed boolean default false not null,
  category_id text not null,
  priority text default 'medium' not null,
  due_time text,
  estimated_minutes integer,
  image_url text,
  subtasks jsonb default '[]'::jsonb not null,
  pinned boolean default false not null,
  created_at bigint not null,
  updated_at bigint not null
);

-- Enable RLS for todo_tasks
alter table public.todo_tasks enable row level security;

-- Drop old policies if existing
drop policy if exists "Users can view own tasks" on public.todo_tasks;
drop policy if exists "Users can insert own tasks" on public.todo_tasks;
drop policy if exists "Users can update own tasks" on public.todo_tasks;
drop policy if exists "Users can delete own tasks" on public.todo_tasks;

-- Create RLS policies for todo_tasks
create policy "Users can view own tasks" on public.todo_tasks
  for select using (auth.uid() = user_id);

create policy "Users can insert own tasks" on public.todo_tasks
  for insert with check (auth.uid() = user_id);

create policy "Users can update own tasks" on public.todo_tasks
  for update using (auth.uid() = user_id);

create policy "Users can delete own tasks" on public.todo_tasks
  for delete using (auth.uid() = user_id);

-- Create indexes for performance
create index if not exists todo_tasks_user_date_idx on public.todo_tasks(user_id, date);


-- 3. Create Edge Drop table
create table if not exists public.drop_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  kind text not null default 'text' check (kind in ('text', 'image', 'file')),
  content text,
  file_name text,
  file_path text,
  file_size bigint,
  mime_type text,
  created_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone default (now() + interval '90 days') not null
);

-- Bring an existing drop_items table up to date without deleting its data.
alter table public.drop_items add column if not exists file_size bigint;
alter table public.drop_items add column if not exists mime_type text;
alter table public.drop_items add column if not exists expires_at timestamp with time zone;
alter table public.drop_items alter column user_id set default auth.uid();
alter table public.drop_items alter column expires_at set default (now() + interval '90 days');
alter table public.drop_items drop constraint if exists drop_items_kind_check;
alter table public.drop_items add constraint drop_items_kind_check
  check (kind in ('text', 'image', 'file'));

alter table public.drop_items enable row level security;

drop policy if exists "drop_items_select_own" on public.drop_items;
drop policy if exists "drop_items_insert_own" on public.drop_items;
drop policy if exists "drop_items_delete_own" on public.drop_items;

create policy "drop_items_select_own" on public.drop_items
  for select using (auth.uid() = user_id);

create policy "drop_items_insert_own" on public.drop_items
  for insert with check (
    auth.uid() = user_id
    and expires_at > now()
    and expires_at <= now() + interval '90 days 5 minutes'
  );

create policy "drop_items_delete_own" on public.drop_items
  for delete using (auth.uid() = user_id);

create index if not exists drop_items_user_created_idx
  on public.drop_items(user_id, created_at desc);

-- Realtime must include this table for cross-device updates.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'drop_items'
  ) then
    alter publication supabase_realtime add table public.drop_items;
  end if;
end
$$;


-- 4. Private Storage bucket for Drop attachments (20 MB per object)
insert into storage.buckets (id, name, public, file_size_limit)
values ('drop-files', 'drop-files', false, 20971520)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "Drop users can read own files" on storage.objects;
drop policy if exists "Drop users can upload own files" on storage.objects;
drop policy if exists "Drop users can delete own files" on storage.objects;

create policy "Drop users can read own files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'drop-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Drop users can upload own files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'drop-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Drop users can delete own files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'drop-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );


-- 5. Durable AI daily quota (used by Vercel AI API routes via user JWT + RPC)
create table if not exists public.ai_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date text not null,
  count integer not null default 0,
  primary key (user_id, usage_date)
);

alter table public.ai_daily_usage enable row level security;

drop policy if exists "ai_daily_usage_select_own" on public.ai_daily_usage;
create policy "ai_daily_usage_select_own" on public.ai_daily_usage
  for select using (auth.uid() = user_id);

create or replace function public.consume_ai_quota(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_date text := to_char((now() at time zone 'Asia/Shanghai'), 'YYYY-MM-DD');
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  insert into public.ai_daily_usage as u (user_id, usage_date, count)
  values (v_user_id, v_date, 1)
  on conflict (user_id, usage_date)
  do update set count = u.count + 1
  where u.count < p_limit
  returning u.count into v_count;

  if v_count is null then
    return -1;
  end if;
  return v_count;
end;
$$;

revoke all on function public.consume_ai_quota(integer) from public;
grant execute on function public.consume_ai_quota(integer) to authenticated;

-- Realtime for tasks / categories (cross-device sync)
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'todo_tasks'
  ) then
    alter publication supabase_realtime add table public.todo_tasks;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'todo_categories'
  ) then
    alter publication supabase_realtime add table public.todo_categories;
  end if;
end
$$;
