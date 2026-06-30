-- ============================================================================
--  CRM platform — initial schema
--  Multi-tenant (organization-scoped) with Row Level Security.
--  Safe to run multiple times.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
--  Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.member_role as enum ('owner', 'admin', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lead_status as enum ('new', 'contacted', 'qualified', 'unqualified', 'converted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.activity_type as enum ('note', 'call', 'meeting', 'email', 'task');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
--  Shared helpers
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- ----------------------------------------------------------------------------
--  Core: profiles, organizations, membership
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  email       text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null default auth.uid() references auth.users(id),
  created_at  timestamptz not null default now()
);

create table if not exists public.organization_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.member_role not null default 'member',
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists idx_org_members_user on public.organization_members(user_id);
create index if not exists idx_org_members_org on public.organization_members(org_id);

-- Membership helpers (SECURITY DEFINER so they bypass RLS and avoid recursion).
create or replace function public.is_org_member(_org_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = _org_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(_org_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = _org_id and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.shares_org_with(_user uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.organization_members a
    join public.organization_members b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = _user
  );
$$;

-- ----------------------------------------------------------------------------
--  Pipeline stages
-- ----------------------------------------------------------------------------
create table if not exists public.stages (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  position    int not null default 0,
  is_won      boolean not null default false,
  is_lost     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_stages_org on public.stages(org_id, position);

-- ----------------------------------------------------------------------------
--  Companies
-- ----------------------------------------------------------------------------
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  industry    text,
  website     text,
  phone       text,
  address     text,
  notes       text,
  owner_id    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_companies_org on public.companies(org_id);

-- ----------------------------------------------------------------------------
--  Contacts
-- ----------------------------------------------------------------------------
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  company_id  uuid references public.companies(id) on delete set null,
  first_name  text not null,
  last_name   text,
  email       text,
  phone       text,
  title       text,
  notes       text,
  owner_id    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_contacts_org on public.contacts(org_id);
create index if not exists idx_contacts_company on public.contacts(company_id);

-- ----------------------------------------------------------------------------
--  Leads
-- ----------------------------------------------------------------------------
create table if not exists public.leads (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  name                 text not null,
  company_name         text,
  email                text,
  phone                text,
  source               text,
  status               public.lead_status not null default 'new',
  value                numeric(14,2),
  notes                text,
  owner_id             uuid default auth.uid() references auth.users(id) on delete set null,
  converted_contact_id uuid references public.contacts(id) on delete set null,
  converted_company_id uuid references public.companies(id) on delete set null,
  converted_deal_id    uuid,
  converted_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_leads_org on public.leads(org_id, status);

-- ----------------------------------------------------------------------------
--  Deals
-- ----------------------------------------------------------------------------
create table if not exists public.deals (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  title               text not null,
  value               numeric(14,2) not null default 0,
  currency            text not null default 'USD',
  stage_id            uuid not null references public.stages(id) on delete restrict,
  company_id          uuid references public.companies(id) on delete set null,
  contact_id          uuid references public.contacts(id) on delete set null,
  expected_close_date date,
  notes               text,
  owner_id            uuid default auth.uid() references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_deals_org on public.deals(org_id);
create index if not exists idx_deals_stage on public.deals(stage_id);

-- Now that deals exists, point leads.converted_deal_id at it.
do $$ begin
  alter table public.leads
    add constraint leads_converted_deal_fk
    foreign key (converted_deal_id) references public.deals(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
--  Activities & Tasks
-- ----------------------------------------------------------------------------
create table if not exists public.activities (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  type        public.activity_type not null default 'note',
  subject     text not null,
  body        text,
  due_date    timestamptz,
  done        boolean not null default false,
  done_at     timestamptz,
  owner_id    uuid default auth.uid() references auth.users(id) on delete set null,
  contact_id  uuid references public.contacts(id) on delete set null,
  company_id  uuid references public.companies(id) on delete set null,
  deal_id     uuid references public.deals(id) on delete set null,
  lead_id     uuid references public.leads(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_activities_org on public.activities(org_id);
create index if not exists idx_activities_due on public.activities(org_id, done, due_date);

-- ----------------------------------------------------------------------------
--  updated_at triggers
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['companies','contacts','leads','deals','activities'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
--  New-org bootstrap: add creator as owner + seed default pipeline stages
-- ----------------------------------------------------------------------------
create or replace function public.handle_org_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.organization_members (org_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (org_id, user_id) do nothing;

  insert into public.stages (org_id, name, position, is_won, is_lost) values
    (new.id, 'ใหม่',          1, false, false),
    (new.id, 'ผ่านคุณสมบัติ',  2, false, false),
    (new.id, 'เสนอราคา',      3, false, false),
    (new.id, 'เจรจาต่อรอง',    4, false, false),
    (new.id, 'ปิดได้',         5, true,  false),
    (new.id, 'เสียดีล',        6, false, true);

  return new;
end; $$;

drop trigger if exists on_org_created on public.organizations;
create trigger on_org_created after insert on public.organizations
  for each row execute function public.handle_org_insert();

-- ----------------------------------------------------------------------------
--  New-user bootstrap: profile + personal workspace
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  display_name text;
begin
  display_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, full_name, email)
  values (new.id, display_name, new.email)
  on conflict (id) do nothing;

  insert into public.organizations (name, created_by)
  values (display_name || '''s Workspace', new.id);

  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
--  Row Level Security
-- ============================================================================
alter table public.profiles            enable row level security;
alter table public.organizations       enable row level security;
alter table public.organization_members enable row level security;
alter table public.stages              enable row level security;
alter table public.companies           enable row level security;
alter table public.contacts            enable row level security;
alter table public.leads               enable row level security;
alter table public.deals               enable row level security;
alter table public.activities          enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_org_with(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = auth.uid());

-- organizations -------------------------------------------------------------
drop policy if exists orgs_select on public.organizations;
create policy orgs_select on public.organizations for select to authenticated
  using (public.is_org_member(id));
drop policy if exists orgs_insert on public.organizations;
create policy orgs_insert on public.organizations for insert to authenticated
  with check (created_by = auth.uid());
drop policy if exists orgs_update on public.organizations;
create policy orgs_update on public.organizations for update to authenticated
  using (public.is_org_admin(id)) with check (public.is_org_admin(id));
drop policy if exists orgs_delete on public.organizations;
create policy orgs_delete on public.organizations for delete to authenticated
  using (public.is_org_admin(id));

-- organization_members ------------------------------------------------------
drop policy if exists members_select on public.organization_members;
create policy members_select on public.organization_members for select to authenticated
  using (public.is_org_member(org_id));
drop policy if exists members_write on public.organization_members;
create policy members_write on public.organization_members for all to authenticated
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

-- Generic org-scoped policy for the CRM tables ------------------------------
do $$
declare t text;
begin
  foreach t in array array['stages','companies','contacts','leads','deals','activities'] loop
    execute format('drop policy if exists %I_member_all on public.%I', t, t);
    execute format(
      'create policy %I_member_all on public.%I for all to authenticated
       using (public.is_org_member(org_id))
       with check (public.is_org_member(org_id))', t, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
--  Grants (RLS still governs row visibility)
-- ----------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
