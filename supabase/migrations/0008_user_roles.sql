-- ============================================================================
--  User roles (business roles) on organization membership.
--  Roles: admin / Sales / Manager / Technician / Job Dispatcher / Accounting
--  (separate from the access-control member_role owner/admin/member).
--  Safe to re-run.
-- ============================================================================

alter table public.organization_members
  add column if not exists app_role text;

-- Make vasawat@uniwave.co.th an admin.
update public.organization_members m
  set app_role = 'admin'
  from auth.users u
  where u.id = m.user_id
    and u.email ilike 'vasawat@uniwave%';
