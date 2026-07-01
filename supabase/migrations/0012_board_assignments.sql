-- ============================================================================
--  Board assignments: admins assign users to pipelines (Sales/Manager) and to
--  service boards (Dispatcher/Technical Supporter/Technician). One row per
--  (board_type, board_key/department, user). Safe to re-run.
-- ============================================================================

create table if not exists public.board_assignments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  board_type  text not null check (board_type in ('pipeline', 'service')),
  board_key   text not null,   -- department value: unigreen / product_sales / services_sales
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (org_id, board_type, board_key, user_id)
);
create index if not exists idx_board_assignments_org on public.board_assignments(org_id);

alter table public.board_assignments enable row level security;
drop policy if exists board_assignments_select on public.board_assignments;
drop policy if exists board_assignments_admin_write on public.board_assignments;
create policy board_assignments_select on public.board_assignments for select to authenticated
  using (public.is_org_member(org_id));
create policy board_assignments_admin_write on public.board_assignments for all to authenticated
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));
grant select, insert, update, delete on public.board_assignments to authenticated;

-- Legacy role rename: "Job Dispatcher" -> "Dispatcher".
update public.organization_members set app_role = 'Dispatcher' where app_role = 'Job Dispatcher';
