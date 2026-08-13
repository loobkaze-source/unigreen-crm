-- 0031: A technician acknowledges an assignment ("กดรับงาน").
--
-- Acceptance is recorded alongside the status rather than as a new status
-- value: `work_order_status` is a Postgres enum, and more importantly "has the
-- technician seen and taken this job" is a different fact from "how far along
-- is the work". Keeping them apart also gives dispatchers a response time.

alter table public.work_orders
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by uuid references auth.users(id);

create index if not exists idx_work_orders_accepted
  on public.work_orders(technician_id, accepted_at);
