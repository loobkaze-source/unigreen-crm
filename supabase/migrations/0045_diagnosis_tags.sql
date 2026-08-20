-- 0045: อาการเสีย, รหัสซ่อม and สาเหตุ are lists, not single values.
--
-- One visit regularly answers more than one thing — an ATG that will not read a
-- level *and* keeps alarming on density — and the fix is as often two codes as
-- one. Written as a single string they were only ever going to be typed as
-- "F01, F04", which reads fine and counts as nothing.
--
-- Arrays, like companies.tags and technicians.skills already are, so a year of
-- jobs can be asked which fault comes back most without unpicking commas.
-- Renamed to plurals in the same breath: there are no work orders yet, and a
-- column called fault_code holding three of them is a lie that outlives anyone
-- who could explain it.

alter table public.work_orders drop column if exists fault_code;
alter table public.work_orders drop column if exists repair_code;
alter table public.work_orders drop column if exists cause;

alter table public.work_orders
  add column if not exists fault_codes  text[] not null default '{}',
  add column if not exists repair_codes text[] not null default '{}',
  add column if not exists causes       text[] not null default '{}';

-- What the suggestions are read from, and what a "which fault recurs" query
-- would sit on.
create index if not exists idx_work_orders_fault_codes on public.work_orders using gin (fault_codes);
create index if not exists idx_work_orders_repair_codes on public.work_orders using gin (repair_codes);
create index if not exists idx_work_orders_causes on public.work_orders using gin (causes);
