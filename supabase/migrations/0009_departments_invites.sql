-- ============================================================================
--  Departments per user + team invites (single-workspace, dept-scoped roles).
--  admin (owner/app_role=admin) sees everything; Manager/Sales/Dispatcher are
--  scoped to a department. Safe to re-run.
-- ============================================================================

-- Rename the auto-generated workspace to the company name.
update public.organizations o
  set name = 'Unigreen Power'
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  where m.org_id = o.id
    and u.email ilike 'vasawat@uniwave%'
    and o.name like '%''s Workspace';

-- Which department a user belongs to (null = all / admin).
alter table public.organization_members
  add column if not exists department text;

-- ----------------------------------------------------------------------------
--  Invites: admin invites people (by email) into the workspace with a
--  role + department; they join automatically when they sign up.
-- ----------------------------------------------------------------------------
create table if not exists public.invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  email       text not null,
  app_role    text,
  department  text,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (org_id, email)
);
create index if not exists idx_invites_email on public.invites(lower(email));

alter table public.invites enable row level security;
-- Members may see pending invites; only admins may create / change / revoke them.
drop policy if exists invites_member_all on public.invites;
drop policy if exists invites_select on public.invites;
drop policy if exists invites_admin_write on public.invites;
create policy invites_select on public.invites for select to authenticated
  using (public.is_org_member(org_id));
create policy invites_admin_write on public.invites for all to authenticated
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));
grant select, insert, update, delete on public.invites to authenticated;

-- ----------------------------------------------------------------------------
--  New-user bootstrap honours invites: join the invited workspace (with the
--  invited role + department) instead of creating a personal one.
-- ----------------------------------------------------------------------------
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
    insert into public.organization_members (org_id, user_id, role, app_role, department)
      values (
        inv.org_id, new.id,
        (case when inv.app_role = 'admin' then 'admin' else 'member' end)::public.member_role,
        inv.app_role,
        case when inv.app_role = 'admin' then null else inv.department end
      )
      on conflict (org_id, user_id) do nothing;
    delete from public.invites where org_id = inv.org_id and lower(email) = lower(new.email);
  else
    insert into public.organizations (name, created_by)
      values (display_name || '''s Workspace', new.id);
  end if;

  return new;
end; $$;
