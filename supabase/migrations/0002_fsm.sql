-- ============================================================================
--  Field Service Management (FSM)
--  Technicians, Work Orders, checklist items, and site photos.
--  Org-scoped with Row Level Security. Safe to run multiple times.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.work_order_type as enum
    ('survey', 'installation', 'maintenance', 'repair', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.work_order_status as enum
    ('new', 'scheduled', 'in_progress', 'on_hold', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.work_order_priority as enum
    ('low', 'normal', 'high', 'urgent');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
--  Technicians (field staff — not necessarily app users)
-- ----------------------------------------------------------------------------
create table if not exists public.technicians (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  skill       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_technicians_org on public.technicians(org_id);

-- ----------------------------------------------------------------------------
--  Work orders
-- ----------------------------------------------------------------------------
create table if not exists public.work_orders (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  number          int,
  title           text not null,
  type            public.work_order_type not null default 'installation',
  status          public.work_order_status not null default 'new',
  priority        public.work_order_priority not null default 'normal',
  company_id      uuid references public.companies(id) on delete set null,
  contact_id      uuid references public.contacts(id) on delete set null,
  deal_id         uuid references public.deals(id) on delete set null,
  technician_id   uuid references public.technicians(id) on delete set null,
  site_address    text,
  site_map_url    text,
  scheduled_start timestamptz,
  scheduled_end   timestamptz,
  description     text,
  completed_at    timestamptz,
  owner_id        uuid default auth.uid() references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_work_orders_org on public.work_orders(org_id, status);
create index if not exists idx_work_orders_sched on public.work_orders(org_id, scheduled_start);
create index if not exists idx_work_orders_tech on public.work_orders(technician_id);

-- Per-org sequential work order number (WO-0001, WO-0002, …)
create or replace function public.set_work_order_number()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.number is null then
    select coalesce(max(number), 0) + 1
      into new.number
      from public.work_orders
     where org_id = new.org_id;
  end if;
  return new;
end; $$;

drop trigger if exists set_wo_number on public.work_orders;
create trigger set_wo_number before insert on public.work_orders
  for each row execute function public.set_work_order_number();

-- ----------------------------------------------------------------------------
--  Checklist items
-- ----------------------------------------------------------------------------
create table if not exists public.work_order_items (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  label         text not null,
  done          boolean not null default false,
  position      int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_wo_items_wo on public.work_order_items(work_order_id);

-- ----------------------------------------------------------------------------
--  Site photos (files live in the 'wo-photos' storage bucket)
-- ----------------------------------------------------------------------------
create table if not exists public.work_order_photos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  path          text not null,
  caption       text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_wo_photos_wo on public.work_order_photos(work_order_id);

-- ----------------------------------------------------------------------------
--  updated_at triggers
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['technicians','work_orders'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ============================================================================
--  Row Level Security
-- ============================================================================
alter table public.technicians        enable row level security;
alter table public.work_orders         enable row level security;
alter table public.work_order_items    enable row level security;
alter table public.work_order_photos   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['technicians','work_orders','work_order_items','work_order_photos'] loop
    execute format('drop policy if exists %I_member_all on public.%I', t, t);
    execute format(
      'create policy %I_member_all on public.%I for all to authenticated
       using (public.is_org_member(org_id))
       with check (public.is_org_member(org_id))', t, t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.technicians, public.work_orders,
  public.work_order_items, public.work_order_photos
  to authenticated;

-- ============================================================================
--  Storage: bucket + policies for work-order site photos
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('wo-photos', 'wo-photos', true)
on conflict (id) do nothing;

drop policy if exists wo_photos_read on storage.objects;
create policy wo_photos_read on storage.objects for select
  using (bucket_id = 'wo-photos');

drop policy if exists wo_photos_insert on storage.objects;
create policy wo_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'wo-photos');

drop policy if exists wo_photos_update on storage.objects;
create policy wo_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'wo-photos');

drop policy if exists wo_photos_delete on storage.objects;
create policy wo_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'wo-photos');
