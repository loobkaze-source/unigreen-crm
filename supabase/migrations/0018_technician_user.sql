-- ============================================================================
--  Link a technician record to a user account (app_role = 'Technician'), so a
--  Technician user shows up in the technician roster and can be assigned to
--  work orders / contracts. Safe to re-run.
-- ============================================================================
alter table public.technicians
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- One technician record per user, per org. Non-partial so upserts can use
-- ON CONFLICT (org_id, user_id); NULL user_ids are distinct (manual techs OK).
create unique index if not exists uq_technicians_user
  on public.technicians(org_id, user_id);
