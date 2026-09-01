-- 0053: กิจกรรม also holds the training queue.
--
-- Activities were built for the sales side — a call, a meeting, a note against
-- a deal — and the field side has no home at all for "who is booked on the
-- ATG course in November". It is the same shape: a subject, a date, and
-- someone it is about. The difference is who: a training session is about
-- technicians, not about a contact at a customer.
--
-- So a type for it, and a table to say who is on it. Many to one, because a
-- course has a room full of people and the point of writing it down is knowing
-- which of them can be spared that week.

alter type public.activity_type add value if not exists 'training';

create table if not exists public.activity_technicians (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  activity_id   uuid not null references public.activities(id) on delete cascade,
  technician_id uuid not null references public.technicians(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (activity_id, technician_id)
);
create index if not exists idx_activity_techs_activity on public.activity_technicians(activity_id);
create index if not exists idx_activity_techs_tech on public.activity_technicians(technician_id);
create index if not exists idx_activity_techs_org on public.activity_technicians(org_id);

alter table public.activity_technicians enable row level security;
drop policy if exists activity_technicians_member_all on public.activity_technicians;
create policy activity_technicians_member_all on public.activity_technicians for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));
grant select, insert, update, delete on public.activity_technicians to authenticated;
