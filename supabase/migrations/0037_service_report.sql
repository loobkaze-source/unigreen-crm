-- 0037: The fields the paper service report asks for that the job did not hold.
--
-- Uniwave has always closed a job on a printed รายงานการซ่อม / SERVICE REPORT,
-- and the technician filled it in by hand on site. Everything on that form was
-- already here except the six below, so the report could not be produced from
-- the job — which is why it kept being written twice.

alter table public.work_orders
  -- The customer's own reference for the visit (Shell issues one per job), and
  -- the number on the report book the technician tears the page from.
  add column if not exists customer_job_no text,
  add column if not exists report_no text,
  -- When the technician actually worked, as opposed to when they were booked:
  -- the form asks for เวลาเริ่มงาน–ถึง and the hours between them.
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  -- ระยะทาง/MILEAGE — the odometer out and back; the difference is the claim.
  add column if not exists mileage_start numeric(10,1),
  add column if not exists mileage_end numeric(10,1),
  -- Items 9–14 on the form, and a visit is regularly several of them at once:
  -- a repair that ends in a calibration. `type` stays what it was — the one
  -- word the dispatcher files the job under — and this is what was done.
  add column if not exists work_kinds text[] not null default '{}';

-- Item 8, เก็บเงินลูกค้า, was already 'paid'; item 7 had nowhere to go.
alter table public.work_orders drop constraint if exists work_orders_billing_chk;
alter table public.work_orders add constraint work_orders_billing_chk
  check (billing is null or billing in ('warranty', 'contract', 'paid'));

-- Labour is priced the same way materials are — a description, an amount and a
-- rate — so it is a third source on the same table rather than a table of its
-- own: same lines, same totals, same card.
alter table public.work_order_parts drop constraint if exists work_order_parts_source_check;
alter table public.work_order_parts add constraint work_order_parts_source_check
  check (source in ('material', 'store', 'labor'));
