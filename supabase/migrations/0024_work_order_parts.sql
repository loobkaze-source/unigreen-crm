-- 0024: Parts replaced during a work order — powers the per-asset lifetime
-- history ("เปลี่ยนอะไหล่ไปกี่รอบ") on the new /assets pages.

create table if not exists public.work_order_parts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  equipment_id  uuid references public.equipment(id) on delete set null,
  name          text not null,
  qty           numeric(10,2) not null default 1,
  created_at    timestamptz not null default now()
);
create index if not exists idx_wo_parts_wo on public.work_order_parts(work_order_id);
create index if not exists idx_wo_parts_equipment on public.work_order_parts(equipment_id);

alter table public.work_order_parts enable row level security;
drop policy if exists work_order_parts_member_all on public.work_order_parts;
create policy work_order_parts_member_all on public.work_order_parts for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));
grant select, insert, update, delete on public.work_order_parts to authenticated;
