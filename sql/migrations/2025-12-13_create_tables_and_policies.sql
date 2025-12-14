-- 2025-12-13 Migration: create user_roles & contact_submissions, enable RLS and add policies
-- Run this with the service_role key from the SQL editor

create extension if not exists "pgcrypto";

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id),
  role text not null,
  created_at timestamptz default now()
);

create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  message text,
  created_at timestamptz default now(),
  status text default 'unread',
  responded_at timestamptz,
  responded_by uuid,
  client_id uuid
);

alter table public.contact_submissions enable row level security;
alter table public.user_roles enable row level security;

create policy "Allow public insert" on public.contact_submissions
  for insert
  using ( true )
  with check ( true );

create policy "Admins can select" on public.contact_submissions
  for select
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'admin'
    )
  );

create policy "Admins can update" on public.contact_submissions
  for update
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles ur2
      where ur2.user_id = auth.uid() and ur2.role = 'admin'
    )
  );

create policy "Admins can delete" on public.contact_submissions
  for delete
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'admin'
    )
  );

create policy "Admins manage user_roles" on public.user_roles
  for all
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles ur2
      where ur2.user_id = auth.uid() and ur2.role = 'admin'
    )
  );
