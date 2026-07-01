-- ============================================================================
--  Link a work order to a Site (so the WO form can cascade
--  customer -> site -> asset). Safe to re-run.
-- ============================================================================
alter table public.work_orders
  add column if not exists site_id uuid references public.sites(id) on delete set null;
create index if not exists idx_work_orders_site on public.work_orders(site_id);
