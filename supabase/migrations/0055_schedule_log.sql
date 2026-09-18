-- 0055: A contract's schedule remembers how it got that way.
--
-- Rounds get moved — the station is closed that week, the customer asks for
-- quarterly instead of twice a year, the crew is elsewhere — and six months
-- later nobody can say why the fourth clean is in March. So every change to
-- the plan is written down: who, when, what it was, what it became, and the
-- reason if one was given.
--
-- One row per change, not per round. A reschedule that moves eight rounds is
-- one decision and reads as one line, with the eight dates inside it.

create table if not exists public.service_schedule_log (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  contract_id  uuid not null references public.service_contracts(id) on delete cascade,
  changed_at   timestamptz not null default now(),
  changed_by   uuid references auth.users(id) on delete set null,
  -- planned: the schedule was first laid out
  -- rescheduled: the owed rounds were re-dated from a start and a frequency
  -- moved: one round was moved by hand
  action       text not null check (action in ('planned', 'rescheduled', 'moved')),
  -- { first_visit_date, frequency_per_year, rounds: [{ seq, due_date }] }
  -- or, for a single move, { seq, due_date }
  before       jsonb,
  after        jsonb not null,
  note         text
);

create index if not exists idx_schedule_log_contract on public.service_schedule_log(contract_id, changed_at desc);
create index if not exists idx_schedule_log_org on public.service_schedule_log(org_id);

alter table public.service_schedule_log enable row level security;
drop policy if exists service_schedule_log_member_all on public.service_schedule_log;
create policy service_schedule_log_member_all on public.service_schedule_log for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));
grant select, insert on public.service_schedule_log to authenticated;
