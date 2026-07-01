-- ============================================================================
--  Admin-managed users: force a password change on first login + let admins
--  reset passwords (no email). `must_change_password` gates app access until
--  the user sets a new password. Safe to re-run.
-- ============================================================================

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

-- Force everyone currently seeded with the temp password (all non-owner
-- members) to set their own password on next login.
update public.profiles p
  set must_change_password = true
  from public.organization_members m
  where m.user_id = p.id and m.role <> 'owner';

-- A user clears their own flag after choosing a new password (no service key
-- needed on this path). SECURITY DEFINER so it can update the profiles row.
create or replace function public.mark_password_changed()
returns void language sql security definer set search_path = public as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;
grant execute on function public.mark_password_changed() to authenticated;
