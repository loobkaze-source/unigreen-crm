-- 0047: A contract number the business can say out loud — UNG-2026-0001.
--
-- Contracts were told apart by their title, which is the customer and the site
-- spelled out twice and runs past eighty characters; two contracts for the same
-- station read identically until you get to the end. The number says who runs
-- it, the year it started, and which one it was.
--
-- Per department per year, so each January starts at 0001 — the same shape the
-- case codes use, and the same counter-row reason: two people writing a
-- contract in the same second would both read the same maximum.

alter table public.service_contracts
  add column if not exists contract_no text;

create table if not exists public.contract_no_counters (
  org_id  uuid not null references public.organizations(id) on delete cascade,
  dept    text not null,
  period  text not null,            -- YYYY
  last_no integer not null default 0,
  primary key (org_id, dept, period)
);

-- No policies: only the definer function below should ever move a counter.
alter table public.contract_no_counters enable row level security;

create or replace function public.assign_contract_no()
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
  if new.contract_no is not null and btrim(new.contract_no) <> '' then
    return new;
  end if;

  -- The board a contract runs on is the department that owns it.
  v_dept := upper(coalesce(nullif(btrim(new.board_key), ''), 'MRD'));
  -- start_date is a date, so no timezone to get wrong; a contract with no start
  -- yet belongs to the year it is being written in, read in Bangkok.
  v_period := to_char(
    coalesce(new.start_date, (now() at time zone 'Asia/Bangkok')::date), 'YYYY'
  );

  insert into public.contract_no_counters (org_id, dept, period, last_no)
  values (new.org_id, v_dept, v_period, 1)
  on conflict (org_id, dept, period)
    do update set last_no = contract_no_counters.last_no + 1
  returning last_no into v_no;

  -- Four digits by agreement; a ten-thousandth contract in one year is not a
  -- numbering problem, so it is left blank rather than silently widened.
  if v_no > 9999 then
    return new;
  end if;

  new.contract_no := v_dept || '-' || v_period || '-' || lpad(v_no::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists service_contracts_assign_no on public.service_contracts;
create trigger service_contracts_assign_no
  before insert on public.service_contracts
  for each row execute function public.assign_contract_no();

create unique index if not exists idx_service_contracts_no
  on public.service_contracts(org_id, contract_no)
  where contract_no is not null;

-- The contracts that predate the number get one in the order they started, so
-- the sequence reads the way it would have if the trigger had always been here.
do $$
declare
  r        record;
  v_dept   text;
  v_period text;
  v_no     integer;
begin
  for r in
    select id, org_id, board_key, start_date, created_at
    from public.service_contracts
    where contract_no is null
    order by start_date nulls last, created_at
  loop
    v_dept := upper(coalesce(nullif(btrim(r.board_key), ''), 'MRD'));
    v_period := to_char(coalesce(r.start_date, r.created_at::date), 'YYYY');

    insert into public.contract_no_counters (org_id, dept, period, last_no)
    values (r.org_id, v_dept, v_period, 1)
    on conflict (org_id, dept, period)
      do update set last_no = contract_no_counters.last_no + 1
    returning last_no into v_no;

    update public.service_contracts
    set contract_no = v_dept || '-' || v_period || '-' || lpad(v_no::text, 4, '0')
    where id = r.id;
  end loop;
end;
$$;
