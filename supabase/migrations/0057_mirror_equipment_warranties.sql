-- 0057: An asset's warranty shows up on the warranties page.
--
-- An asset carries its own warranty in two columns — warranty_start and
-- warranty_months — and the asset list reads them and says "ในประกันถึง
-- 26-05-2034". The warranties page reads a different table and knew nothing
-- about them: eighty assets under warranty, none of them listed where a person
-- goes to look for warranties.
--
-- The asset stays the place that fact is written, because that is where it
-- gets entered — on the asset form, next to the serial number. A trigger
-- mirrors it into the warranties table as a row of its own, marked as a
-- mirror so it follows the asset (moves when the dates move, goes when the
-- warranty is cleared) and so nothing hand-written is ever touched by it.

alter table public.warranties
  add column if not exists mirrored boolean not null default false;

-- One mirror per asset, and a fast way to find it.
create unique index if not exists idx_warranties_mirror_of
  on public.warranties(equipment_id) where mirrored;

comment on column public.warranties.mirrored is
  'True when this row is a copy of equipment.warranty_start/warranty_months and is maintained by trigger.';

create or replace function public.mirror_equipment_warranty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_end      date;
  v_site     public.sites%rowtype;
begin
  -- Cleared, or never set: the mirror goes. Hand-written rows are not mirrors
  -- and are not touched.
  if new.warranty_start is null or coalesce(new.warranty_months, 0) <= 0 then
    delete from public.warranties where equipment_id = new.id and mirrored;
    return new;
  end if;

  v_end := (new.warranty_start + (new.warranty_months || ' months')::interval)::date;
  select * into v_site from public.sites where id = new.site_id;

  insert into public.warranties
    (org_id, kind, company_id, site_id, equipment_id, title, serial_number,
     start_date, end_date, status, mirrored)
  values
    (new.org_id, 'equipment'::public.warranty_kind, v_site.company_id, new.site_id, new.id,
     coalesce(nullif(new.name, ''), new.model, 'Asset'),
     new.serial_number, new.warranty_start, v_end,
     (case when v_end >= current_date then 'active' else 'expired' end)::public.warranty_status,
     true)
  on conflict (equipment_id) where mirrored do update set
    company_id    = excluded.company_id,
    site_id       = excluded.site_id,
    title         = excluded.title,
    serial_number = excluded.serial_number,
    start_date    = excluded.start_date,
    end_date      = excluded.end_date,
    -- A mirror somebody voided stays void; otherwise follow the date.
    status        = case when public.warranties.status = 'void' then public.warranties.status else excluded.status end;
  return new;
end;
$$;

drop trigger if exists equipment_mirror_warranty on public.equipment;
create trigger equipment_mirror_warranty
  after insert or update of warranty_start, warranty_months, name, model, serial_number, site_id
  on public.equipment
  for each row execute function public.mirror_equipment_warranty();

-- The eighty already here.
update public.equipment set warranty_start = warranty_start
where warranty_start is not null and coalesce(warranty_months, 0) > 0;
