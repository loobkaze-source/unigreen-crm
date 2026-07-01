-- ============================================================================
--  Link a work order to a case / ticket (the WO resolves the case; a case
--  shouldn't be closed until its work orders are done — enforced in the app).
--  Safe to re-run.
-- ============================================================================
alter table public.work_orders
  add column if not exists case_id uuid references public.cases(id) on delete set null;
create index if not exists idx_work_orders_case on public.work_orders(org_id, case_id);
