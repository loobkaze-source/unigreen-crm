-- ============================================================================
--  Phase 2 — Assets (object/project + per-asset warranty), work-order service
--  fields (CM/PM, billing, linked asset, service board). Uses text + CHECK
--  (no enums) for easy use with the untyped client. Safe to re-run.
-- ============================================================================

-- ---- Assets: the equipment table becomes the per-site "Asset" ---------------
--  asset_type 'object'  -> physical item, identified by serial_number
--  asset_type 'project' -> a project, identified by project_number
alter table public.equipment
  add column if not exists asset_type      text not null default 'object',
  add column if not exists project_number  text,
  add column if not exists warranty_months int,
  add column if not exists warranty_start  date;

alter table public.equipment drop constraint if exists equipment_asset_type_chk;
alter table public.equipment
  add constraint equipment_asset_type_chk check (asset_type in ('object', 'project'));

-- ---- Work orders: CM/PM, billing, linked asset, service board ---------------
alter table public.work_orders
  add column if not exists job_class text,   -- 'CM' | 'PM'
  add column if not exists billing   text,   -- 'warranty' | 'paid'
  add column if not exists asset_id  uuid references public.equipment(id) on delete set null,
  add column if not exists board_key text;   -- unigreen / product_sales / services_sales

alter table public.work_orders drop constraint if exists work_orders_job_class_chk;
alter table public.work_orders
  add constraint work_orders_job_class_chk check (job_class is null or job_class in ('CM', 'PM'));
alter table public.work_orders drop constraint if exists work_orders_billing_chk;
alter table public.work_orders
  add constraint work_orders_billing_chk check (billing is null or billing in ('warranty', 'paid'));

create index if not exists idx_work_orders_board on public.work_orders(org_id, board_key);
create index if not exists idx_work_orders_asset on public.work_orders(asset_id);

-- ---- Service contracts: which service board they belong to ------------------
alter table public.service_contracts add column if not exists board_key text;
