-- 0026: Many assets per case. Opening a case now starts from the customer,
-- filters to that customer's sites, then lets the operator tick the affected
-- assets (checkbox). More assets can be added later after an inspection.
--
-- Source of truth becomes `case_assets`; `cases.equipment_id` is kept in sync
-- with the first linked asset for backward compatibility.

create table if not exists public.case_assets (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  case_id       uuid not null references public.cases(id) on delete cascade,
  equipment_id  uuid not null references public.equipment(id) on delete cascade,
  -- Reported operating condition of the asset for this case.
  condition     text check (condition in ('operational','degraded','down')),
  created_at    timestamptz not null default now(),
  unique (case_id, equipment_id)
);
create index if not exists idx_case_assets_case on public.case_assets(case_id);
create index if not exists idx_case_assets_equipment on public.case_assets(equipment_id);

alter table public.case_assets enable row level security;
drop policy if exists case_assets_member_all on public.case_assets;
create policy case_assets_member_all on public.case_assets for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));
grant select, insert, update, delete on public.case_assets to authenticated;

-- Backfill: pull any existing single-asset link into the new join table.
insert into public.case_assets (org_id, case_id, equipment_id)
select c.org_id, c.id, c.equipment_id
from public.cases c
where c.equipment_id is not null
on conflict (case_id, equipment_id) do nothing;
