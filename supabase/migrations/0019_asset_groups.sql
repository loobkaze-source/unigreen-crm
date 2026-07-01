-- ============================================================================
--  Asset groups: named groups of assets WITHIN a single site. An asset belongs
--  to at most one group, and that group must be on the asset's own site
--  (enforced in the app). Safe to re-run.
-- ============================================================================
create table if not exists public.asset_groups (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  site_id    uuid not null references public.sites(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_asset_groups_site on public.asset_groups(site_id);

alter table public.equipment
  add column if not exists group_id uuid references public.asset_groups(id) on delete set null;
create index if not exists idx_equipment_group on public.equipment(group_id);

-- updated_at trigger
drop trigger if exists set_updated_at on public.asset_groups;
create trigger set_updated_at before update on public.asset_groups
  for each row execute function public.set_updated_at();

alter table public.asset_groups enable row level security;
drop policy if exists asset_groups_member_all on public.asset_groups;
create policy asset_groups_member_all on public.asset_groups for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));
grant select, insert, update, delete on public.asset_groups to authenticated;
