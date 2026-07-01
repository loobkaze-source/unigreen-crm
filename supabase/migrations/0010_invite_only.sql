-- ============================================================================
--  Make signup INVITE-ONLY. A new account is allowed only if its email has a
--  pending invite (created by an admin in /users). The single exception is
--  bootstrapping a brand-new project (zero organizations yet) — the first user
--  becomes the owner. Everyone else without an invite is rejected, so random
--  strangers can no longer create accounts / junk workspaces. Safe to re-run.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  display_name text;
  inv record;
begin
  display_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, full_name, email)
  values (new.id, display_name, new.email)
  on conflict (id) do nothing;

  select * into inv from public.invites
    where lower(email) = lower(new.email)
    order by created_at asc limit 1;

  if inv.org_id is not null then
    -- Invited: join that workspace with the assigned role + department.
    insert into public.organization_members (org_id, user_id, role, app_role, department)
      values (
        inv.org_id, new.id,
        (case when inv.app_role = 'admin' then 'admin' else 'member' end)::public.member_role,
        inv.app_role,
        case when inv.app_role = 'admin' then null else inv.department end
      )
      on conflict (org_id, user_id) do nothing;
    delete from public.invites where org_id = inv.org_id and lower(email) = lower(new.email);

  elsif (select count(*) from public.organizations) = 0 then
    -- Bootstrap: first user of a fresh project creates the first workspace.
    insert into public.organizations (name, created_by)
      values (display_name || '''s Workspace', new.id);

  else
    -- Not invited -> reject the signup (rolls back the auth user).
    raise exception 'invite_required: signup is invite-only — please ask an admin for an invitation';
  end if;

  return new;
end; $$;
