-- ============================================================================
--  Phase 2 — Sites, Equipment, Service Contracts, Warranties
--  + contact ↔ company many-to-many. Org-scoped, RLS. Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.equipment_category as enum
    ('solar_panel', 'inverter', 'ev_charger', 'battery', 'meter', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.service_type as enum
    ('panel_cleaning', 'filter_cleaning', 'inspection', 'maintenance', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.visit_status as enum ('pending', 'done', 'skipped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.contract_status as enum ('active', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.warranty_kind as enum ('project', 'equipment');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.warranty_status as enum ('active', 'expired', 'void');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
--  Sites (a company / legal entity can have many sites)
-- ----------------------------------------------------------------------------
create table if not exists public.sites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  company_id  uuid references public.companies(id) on delete set null,
  name        text not null,
  address     text,
  map_url     text,
  contact_id  uuid references public.contacts(id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_sites_org on public.sites(org_id);
create index if not exists idx_sites_company on public.sites(company_id);

-- ----------------------------------------------------------------------------
--  Equipment (a site can have many devices; warranty tracked by serial)
-- ----------------------------------------------------------------------------
create table if not exists public.equipment (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  site_id       uuid references public.sites(id) on delete cascade,
  name          text not null,
  category      public.equipment_category not null default 'other',
  brand         text,
  model         text,
  serial_number text,
  install_date  date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_equipment_org on public.equipment(org_id);
create index if not exists idx_equipment_site on public.equipment(site_id);
create index if not exists idx_equipment_serial on public.equipment(serial_number);

-- ----------------------------------------------------------------------------
--  Contact ↔ Company (many-to-many)
-- ----------------------------------------------------------------------------
create table if not exists public.contact_companies (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  role        text,
  created_at  timestamptz not null default now(),
  unique (contact_id, company_id)
);
create index if not exists idx_cc_contact on public.contact_companies(contact_id);
create index if not exists idx_cc_company on public.contact_companies(company_id);

-- Backfill the M2M table from the existing contacts.company_id (primary company)
insert into public.contact_companies (org_id, contact_id, company_id)
select c.org_id, c.id, c.company_id
from public.contacts c
where c.company_id is not null
on conflict (contact_id, company_id) do nothing;

-- ----------------------------------------------------------------------------
--  Service contracts (e.g. panel cleaning 5 years, 2× / year)
-- ----------------------------------------------------------------------------
create table if not exists public.service_contracts (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  company_id         uuid references public.companies(id) on delete set null,
  site_id            uuid references public.sites(id) on delete set null,
  title              text not null,
  service_type       public.service_type not null default 'panel_cleaning',
  start_date         date not null default current_date,
  frequency_per_year int not null default 2,
  duration_years     numeric(4,1) not null default 5,
  end_date           date,
  technician_id      uuid references public.technicians(id) on delete set null,
  status             public.contract_status not null default 'active',
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_contracts_org on public.service_contracts(org_id, status);

-- ----------------------------------------------------------------------------
--  Service visits (the scheduled rounds of a contract)
-- ----------------------------------------------------------------------------
create table if not exists public.service_visits (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  contract_id   uuid not null references public.service_contracts(id) on delete cascade,
  seq           int not null,
  due_date      date not null,
  status        public.visit_status not null default 'pending',
  completed_at  date,
  work_order_id uuid references public.work_orders(id) on delete set null,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_visits_contract on public.service_visits(contract_id, seq);
create index if not exists idx_visits_due on public.service_visits(org_id, status, due_date);

-- ----------------------------------------------------------------------------
--  Warranties (project-wide, or per-equipment by serial number)
-- ----------------------------------------------------------------------------
create table if not exists public.warranties (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  kind          public.warranty_kind not null default 'project',
  company_id    uuid references public.companies(id) on delete set null,
  site_id       uuid references public.sites(id) on delete set null,
  equipment_id  uuid references public.equipment(id) on delete set null,
  title         text not null,
  serial_number text,
  provider      text,
  start_date    date,
  end_date      date,
  terms         text,
  status        public.warranty_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_warranties_org on public.warranties(org_id, kind);
create index if not exists idx_warranties_equipment on public.warranties(equipment_id);

-- ----------------------------------------------------------------------------
--  updated_at triggers
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['sites','equipment','service_contracts','warranties'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ============================================================================
--  Row Level Security (org-scoped)
-- ============================================================================
alter table public.sites             enable row level security;
alter table public.equipment         enable row level security;
alter table public.contact_companies enable row level security;
alter table public.service_contracts enable row level security;
alter table public.service_visits    enable row level security;
alter table public.warranties        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sites','equipment','contact_companies',
                           'service_contracts','service_visits','warranties'] loop
    execute format('drop policy if exists %I_member_all on public.%I', t, t);
    execute format(
      'create policy %I_member_all on public.%I for all to authenticated
       using (public.is_org_member(org_id))
       with check (public.is_org_member(org_id))', t, t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.sites, public.equipment, public.contact_companies,
  public.service_contracts, public.service_visits, public.warranties
  to authenticated;
