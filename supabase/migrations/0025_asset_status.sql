-- 0025: Asset operating status + the case→asset link that drives it.
--   ใช้งานได้ (operational) / พอใช้งานได้ (degraded) / ใช้งานไม่ได้ (down) /
--   ปลดระวาง (retired). Set from the case form when a problem is reported;
--   completing a repair work order flips degraded/down back to operational.

alter table public.equipment
  add column if not exists status text not null default 'operational';
alter table public.equipment drop constraint if exists equipment_status_chk;
alter table public.equipment
  add constraint equipment_status_chk
  check (status in ('operational', 'degraded', 'down', 'retired'));
create index if not exists idx_equipment_status on public.equipment(org_id, status);

alter table public.cases
  add column if not exists equipment_id uuid references public.equipment(id) on delete set null;
create index if not exists idx_cases_equipment on public.cases(equipment_id);
