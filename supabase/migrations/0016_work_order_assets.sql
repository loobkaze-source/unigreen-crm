-- ============================================================================
--  A work order can involve MANY assets (M2M). Backfills the existing single
--  work_orders.asset_id into the junction. Safe to re-run.
-- ============================================================================
create table if not exists public.work_order_assets (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  equipment_id  uuid not null references public.equipment(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (work_order_id, equipment_id)
);
create index if not exists idx_wo_assets_wo on public.work_order_assets(work_order_id);
create index if not exists idx_wo_assets_eq on public.work_order_assets(equipment_id);

alter table public.work_order_assets enable row level security;
drop policy if exists work_order_assets_member_all on public.work_order_assets;
create policy work_order_assets_member_all on public.work_order_assets for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));
grant select, insert, update, delete on public.work_order_assets to authenticated;

-- Backfill from the existing single asset_id.
insert into public.work_order_assets (org_id, work_order_id, equipment_id)
select org_id, id, asset_id
from public.work_orders
where asset_id is not null
on conflict (work_order_id, equipment_id) do nothing;
