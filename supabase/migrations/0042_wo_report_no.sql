-- 0042: The report number is the case's number, plus which visit this was.
--
-- MRD-0826-00001-01, then -02. One fault regularly takes more than one visit —
-- a part has to be ordered, a second pair of hands is needed — and every visit
-- leaves its own signed report with the customer. Deriving the number from the
-- case ties the paperwork back to what it was about, without anyone composing
-- it by hand on the bonnet of a truck.
--
-- The suffix comes from a counter row rather than from counting the work orders
-- already there: two dispatchers raising a visit for the same fault in the same
-- second would otherwise both read 01.

create table if not exists public.work_order_report_counters (
  org_id  uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  last_no integer not null default 0,
  primary key (org_id, case_id)
);

-- No policies: only the definer function below should ever move a counter.
alter table public.work_order_report_counters enable row level security;

create or replace function public.assign_wo_report_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_no   integer;
begin
  -- Already numbered, or nothing to derive one from.
  if new.report_no is not null and btrim(new.report_no) <> '' then
    return new;
  end if;
  if new.case_id is null then
    return new;
  end if;

  select code into v_code from public.cases where id = new.case_id;
  if v_code is null or btrim(v_code) = '' then
    return new;
  end if;

  insert into public.work_order_report_counters (org_id, case_id, last_no)
  values (new.org_id, new.case_id, 1)
  on conflict (org_id, case_id)
    do update set last_no = work_order_report_counters.last_no + 1
  returning last_no into v_no;

  -- Two digits by agreement. A hundredth visit to one fault is not a numbering
  -- problem, so it is left blank for someone to write rather than silently
  -- turned into a shape nobody agreed to.
  if v_no > 99 then
    return new;
  end if;

  new.report_no := v_code || '-' || lpad(v_no::text, 2, '0');
  return new;
end;
$$;

drop trigger if exists work_orders_assign_report_no on public.work_orders;
create trigger work_orders_assign_report_no
  -- Also on update: a job raised without a case gets its number when one is
  -- attached, which is when there is finally something to derive it from.
  before insert or update of case_id, report_no on public.work_orders
  for each row execute function public.assign_wo_report_no();

create unique index if not exists idx_work_orders_report_no
  on public.work_orders(org_id, report_no)
  where report_no is not null;

-- Jobs raised before this got their number the same way, oldest first: setting
-- report_no puts it in the trigger's column list, and the trigger fills what it
-- finds empty.
update public.work_orders set report_no = null
where report_no is null and case_id is not null;
