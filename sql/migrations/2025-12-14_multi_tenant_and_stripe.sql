-- Migration: add organizations, user_memberships, add client_id to contact_submissions, and Stripe-related table
-- Run with service_role in Supabase SQL editor

create extension if not exists "pgcrypto";

-- organizations / clients
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stripe_customer_id text,
  subscription_status text,
  subscription_current_period_end timestamptz,
  created_at timestamptz default now()
);

-- user_memberships: links users to clients with roles
create table if not exists public.user_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  client_id uuid references public.clients(id) not null,
  role text not null default 'agent', -- owner, admin, agent
  created_at timestamptz default now()
);

-- ensure contact_submissions has client_id for tenancy
alter table public.contact_submissions add column if not exists client_id uuid;

-- RLS: enable on clients and user_memberships if not already
alter table public.clients enable row level security;
alter table public.user_memberships enable row level security;

-- RLS policies for user_memberships: only members can see their membership
create policy "members can select memberships" on public.user_memberships
  for select
  using ( exists (select 1 from public.user_memberships um where um.user_id = auth.uid() and um.client_id = client_id) );

-- RLS for contact_submissions: anyone can INSERT, but SELECT/UPDATE/DELETE limited to membership and roles
create policy "Allow public insert" on public.contact_submissions
  for insert
  using ( true )
  with check ( true );

create policy "Members can select their client submissions" on public.contact_submissions
  for select
  using (
    exists (
      select 1 from public.user_memberships um
      where um.user_id = auth.uid() and um.client_id = client_id
    )
  );

create policy "Members can update if role in ('admin','owner')" on public.contact_submissions
  for update
  using (
    exists (
      select 1 from public.user_memberships um
      where um.user_id = auth.uid() and um.client_id = client_id and um.role in ('admin','owner')
    )
  )
  with check (
    exists (
      select 1 from public.user_memberships um2
      where um2.user_id = auth.uid() and um2.client_id = client_id and um2.role in ('admin','owner')
    )
  );

create policy "Members can delete if role in ('admin','owner')" on public.contact_submissions
  for delete
  using (
    exists (
      select 1 from public.user_memberships um
      where um.user_id = auth.uid() and um.client_id = client_id and um.role in ('admin','owner')
    )
  );

-- RLS for clients: members can select their client
create policy "Members can select client" on public.clients
  for select
  using (
    exists (
      select 1 from public.user_memberships um
      where um.user_id = auth.uid() and um.client_id = id
    )
  );

-- Optional: table to store stripe webhook events for auditing
create table if not exists public.stripe_events (
  id uuid primary key default gen_random_uuid(),
  event_id text,
  payload jsonb,
  created_at timestamptz default now()
);
