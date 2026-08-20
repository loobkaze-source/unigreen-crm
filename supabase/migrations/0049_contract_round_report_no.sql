-- 0049: A job raised for a contract round is numbered after the round.
--
-- UNG-2024-0004-01, then -02. The same shape as the case-driven number
-- (MRD-0826-00001-01) and for the same reason: the number on the report the
-- customer signs should say what the visit was for. WO-0102 says only that a
-- hundred and one other jobs exist.
--
-- The round is where the number comes from, so the stamp happens when a round
-- takes a job rather than when the job is written — at insert the job does not
-- yet know which round it serves. The suffix is the round's own seq, not a
-- counter, so the fourth cleaning is -04 whatever order the records were made
-- in, and re-running an import cannot shift it.

create or replace function public.stamp_visit_report_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_no text;
begin
  if new.work_order_id is null then
    return new;
  end if;

  select c.contract_no into v_no
  from public.service_contracts c
  where c.id = new.contract_id;

  if v_no is null or btrim(v_no) = '' then
    return new;
  end if;

  -- Only fills what is empty: a number typed by hand, or one already derived
  -- from a case, is the one somebody has quoted.
  update public.work_orders
  set report_no = v_no || '-' || lpad(new.seq::text, 2, '0')
  where id = new.work_order_id
    and (report_no is null or btrim(report_no) = '');

  return new;
end;
$$;

drop trigger if exists service_visits_stamp_report_no on public.service_visits;
create trigger service_visits_stamp_report_no
  after insert or update of work_order_id on public.service_visits
  for each row execute function public.stamp_visit_report_no();

-- The rounds already carrying a job get their numbers now.
update public.service_visits set work_order_id = work_order_id
where work_order_id is not null;
