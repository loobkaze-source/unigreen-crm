-- ============================================================================
--  Unique per-org Asset Code (AS-0001, AS-0002, …). Serial numbers are NOT
--  globally unique (two brands can share one), so the Asset's true identity is
--  this system code; serial_number / project_number stay descriptive. The
--  work_orders.asset_id FK already links to the exact asset row (unambiguous).
--  Mirrors set_work_order_number. Safe to re-run.
-- ============================================================================

alter table public.equipment add column if not exists code int;

create or replace function public.set_equipment_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.code is null then
    select coalesce(max(code), 0) + 1
      into new.code
      from public.equipment
     where org_id = new.org_id;
  end if;
  return new;
end; $$;

drop trigger if exists set_equipment_code on public.equipment;
create trigger set_equipment_code before insert on public.equipment
  for each row execute function public.set_equipment_code();

-- Backfill existing assets: sequential per org, ordered by creation.
with numbered as (
  select id, row_number() over (partition by org_id order by created_at, id) as rn
  from public.equipment
  where code is null
)
update public.equipment e
  set code = n.rn
  from numbered n
  where e.id = n.id;
