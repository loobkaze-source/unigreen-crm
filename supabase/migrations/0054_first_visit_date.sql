-- 0054: The first visit is a date of its own, not the day the contract starts.
--
-- Round 1 fell on the contract's start date because nothing else was asked
-- for, and nobody cleans the panels on the day the paperwork is signed: the
-- first visit is a few weeks out, agreed with the customer, and every later
-- round is counted from it. So the form asks for it, and the schedule is
-- generated from it. Kept on the contract so that editing the frequency later
-- regenerates the rounds from the same anchor rather than sliding them all
-- back to the signing date.
--
-- Existing contracts get the date their round 1 already carries, which is what
-- it was — nothing moves.

alter table public.service_contracts
  add column if not exists first_visit_date date;

update public.service_contracts c
set first_visit_date = v.due_date
from (
  select contract_id, min(due_date) as due_date
  from public.service_visits
  where seq = 1
  group by contract_id
) v
where v.contract_id = c.id and c.first_visit_date is null;

-- A contract with no rounds at all falls back to its start.
update public.service_contracts
set first_visit_date = start_date
where first_visit_date is null;

comment on column public.service_contracts.first_visit_date is
  'When round 1 is due; every later round is counted from here, not from start_date.';
