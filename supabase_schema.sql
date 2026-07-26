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
