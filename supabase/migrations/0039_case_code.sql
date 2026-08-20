-- 0039: A case code the business recognises — MRD-0826-00001.
--
-- Cases had a plain running `number`, which says nothing about who owns the
-- job or when it came in. The code people actually quote carries all three:
-- the department that opened it, the month and year, and a serial that starts
-- again each month.
--
-- The serial is handed out by a counter row rather than by counting the cases
-- already there: two people opening a case in the same second would otherwise
-- both read the same maximum and both write 00007. The counter is bumped and
-- read in one statement, so the second one waits and gets 00008.

alter table public.cases
  add column if not exists dept_code text,
  add column if not exists code text;

create table if not exists public.case_code_counters (
  org_id  uuid not null references public.organizations(id) on delete cascade,
  dept    text not null,
  period  text not null,            -- MMYY, e.g. 0826
  last_no integer not null default 0,
  primary key (org_id, dept, period)
);

-- No policies: nothing reaches this table except the definer function below,
-- which is the only thing that should ever move a counter.
alter table public.case_code_counters enable row level security;

create or replace function public.assign_case_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept   text;
  v_period text;
  v_no     integer;
begin
  if new.code is not null and btrim(new.code) <> '' then
    return new;
  end if;

  v_dept := upper(coalesce(nullif(btrim(new.dept_code), ''), 'MRD'));
  -- Bangkok, not UTC: a case opened at 1am on the 1st belongs to the month the
  -- person opening it is living in, not the one the server is.
  v_period := to_char(
    (coalesce(new.case_date, now()) at time zone 'Asia/Bangkok'), 'MMYY'
  );

  insert into public.case_code_counters (org_id, dept, period, last_no)
  values (new.org_id, v_dept, v_period, 1)
  on conflict (org_id, dept, period)
    do update set last_no = case_code_counters.last_no + 1
  returning last_no into v_no;

  new.dept_code := v_dept;
  new.code := v_dept || '-' || v_period || '-' || lpad(v_no::text, 5, '0');
  return new;
end;
$$;

drop trigger if exists cases_assign_code on public.cases;
create trigger cases_assign_code
  before insert on public.cases
  for each row execute function public.assign_case_code();

create unique index if not exists idx_cases_code on public.cases(org_id, code);

-- Cases opened before the code existed get one in the order they came in, so
-- the serials read the way they would have if the trigger had always been here.
-- They predate the choice of department, so they land under the default.
do $$
declare
  r        record;
  v_period text;
  v_no     integer;
begin
  for r in
    select id, org_id, case_date, created_at
    from public.cases
    where code is null
    order by created_at
  loop
    v_period := to_char(
      (coalesce(r.case_date, r.created_at) at time zone 'Asia/Bangkok'), 'MMYY'
    );
    insert into public.case_code_counters (org_id, dept, period, last_no)
    values (r.org_id, 'MRD', v_period, 1)
    on conflict (org_id, dept, period)
      do update set last_no = case_code_counters.last_no + 1
    returning last_no into v_no;

    update public.cases
    set dept_code = 'MRD',
        code = 'MRD-' || v_period || '-' || lpad(v_no::text, 5, '0')
    where id = r.id;
  end loop;
end;
$$;
