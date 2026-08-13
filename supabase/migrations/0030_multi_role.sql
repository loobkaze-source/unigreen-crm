-- 0030: A member can hold several roles at once (e.g. Technician + Safety).
--
-- `app_roles` becomes the source of truth. `app_role` is kept and mirrored to
-- the primary role ('admin' when present, otherwise the first one) so existing
-- queries and the signup trigger keep working.

alter table public.organization_members
  add column if not exists app_roles text[] not null default '{}';

-- Backfill from the single role that was there before.
update public.organization_members
set app_roles = array[app_role]
where app_role is not null
  and app_role <> ''
  and cardinality(app_roles) = 0;

-- Membership rows that never had a role keep an empty array.
create index if not exists idx_org_members_app_roles
  on public.organization_members using gin (app_roles);

-- Invites carry the roles through signup as well.
alter table public.invites
  add column if not exists app_roles text[] not null default '{}';

update public.invites
set app_roles = array[app_role]
where app_role is not null
  and app_role <> ''
  and cardinality(app_roles) = 0;

-- The signup trigger now copies the whole set from the invite. Same logic as
-- migration 0010 otherwise (invite-only, with the fresh-project bootstrap).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  display_name text;
  inv record;
  v_primary text;
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
    -- 'admin' wins as the primary role, otherwise the first listed one.
    v_primary := case
      when 'admin' = any(coalesce(inv.app_roles, array[]::text[])) then 'admin'
      else coalesce(inv.app_roles[1], inv.app_role)
    end;

    insert into public.organization_members (org_id, user_id, role, app_role, app_roles, department)
      values (
        inv.org_id, new.id,
        (case when v_primary = 'admin' then 'admin' else 'member' end)::public.member_role,
        v_primary,
        coalesce(nullif(inv.app_roles, array[]::text[]), array[inv.app_role]),
        case when v_primary = 'admin' then null else inv.department end
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
