-- ============================================================================
--  Cases (support) + Products (catalog) — for the Venio data import.
--  Org-scoped, RLS. Safe to re-run.
-- ============================================================================

do $$ begin
  create type public.case_status as enum ('open', 'in_progress', 'closed');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
--  Cases
-- ----------------------------------------------------------------------------
create table if not exists public.cases (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  number      int,
  subject     text not null,
  status      public.case_status not null default 'open',
  case_type   text,
  case_from   text,
  note        text,
  action      text,
  employee    text,
  team        text,
  company_id  uuid references public.companies(id) on delete set null,
  contact_id  uuid references public.contacts(id) on delete set null,
  case_date   timestamptz,
  source      text,
  owner_id    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_cases_org on public.cases(org_id, status);

create or replace function public.set_case_number()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.number is null then
    select coalesce(max(number), 0) + 1 into new.number
      from public.cases where org_id = new.org_id;
  end if;
  return new;
end; $$;

drop trigger if exists set_case_number on public.cases;
create trigger set_case_number before insert on public.cases
  for each row execute function public.set_case_number();

-- ----------------------------------------------------------------------------
--  Products (catalog / inventory)
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  sku         text,
  name        text not null,
  description text,
  category    text,
  barcode     text,
  cost        numeric(14,2),
  price       numeric(14,2),
  unit        text,
  quantity    numeric(14,2),
  active      boolean not null default true,
  source      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_products_org on public.products(org_id);
create index if not exists idx_products_sku on public.products(sku);

-- ----------------------------------------------------------------------------
--  updated_at triggers
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['cases','products'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
--  RLS
-- ----------------------------------------------------------------------------
alter table public.cases    enable row level security;
alter table public.products enable row level security;

do $$
declare t text;
begin
  foreach t in array array['cases','products'] loop
    execute format('drop policy if exists %I_member_all on public.%I', t, t);
    execute format(
      'create policy %I_member_all on public.%I for all to authenticated
       using (public.is_org_member(org_id))
       with check (public.is_org_member(org_id))', t, t);
  end loop;
end $$;

grant select, insert, update, delete on public.cases, public.products to authenticated;
