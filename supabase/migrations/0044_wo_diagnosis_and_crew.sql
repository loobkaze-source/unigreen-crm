-- 0044: What was wrong, what was done about it, and who did it.
--
-- The old system closed a job with four answers the CRM had nowhere to put: a
-- code for the symptom (F01 : ไม่อ่านค่าระดับน้ำมัน), a code for the fix
-- (S03 : เปลี่ยนอุปกรณ์ใหม่), and free text for the cause and the remedy. The
-- codes are what makes a year of jobs countable — which fault recurs, which fix
-- holds — and they were being written into a notes field nothing could sum.
--
-- Text rather than a lookup table: the catalogues live on paper at the moment,
-- and the form offers what has already been typed, so the vocabulary settles
-- without anyone having to key a list in first.

alter table public.work_orders
  add column if not exists fault_code text,
  add column if not exists repair_code text,
  add column if not exists cause text,
  add column if not exists remedy text;

-- A job is regularly two or three people. technician_id stays the one who owns
-- it — the one งานของฉัน shows it to, and the one the dispatcher chased — and
-- this is everybody who stood on site, which is what the report lists.
create table if not exists public.work_order_technicians (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  technician_id uuid not null references public.technicians(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (work_order_id, technician_id)
);
create index if not exists idx_wo_techs_wo on public.work_order_technicians(work_order_id);
create index if not exists idx_wo_techs_tech on public.work_order_technicians(technician_id);

alter table public.work_order_technicians enable row level security;
drop policy if exists work_order_technicians_member_all on public.work_order_technicians;
create policy work_order_technicians_member_all on public.work_order_technicians for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));
grant select, insert, update, delete on public.work_order_technicians to authenticated;
