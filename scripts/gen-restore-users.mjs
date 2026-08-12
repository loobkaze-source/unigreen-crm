// Generates backups/restore-users.sql from the newest backup JSON.
//
// Run:  node scripts/gen-restore-users.mjs [tempPassword]
//
// Auth users must be recreated with their ORIGINAL uuids, otherwise every
// owner_id / supporter_id / user_id in the restored data would dangle. The
// Supabase admin API cannot set a user id, so this has to be SQL.
//
// Password hashes are NOT in the JSON backup (they live in auth.users, which
// the REST API doesn't expose), so everyone gets the same temp password and is
// flagged must_change_password — the app forces a reset at /set-password on
// first login.
//
// Output goes to backups/ (gitignored) because it contains real emails.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const TEMP_PW = process.argv[2] || "Uniwave#2026";

const dir = "c:/CRM/backups";
const file = readdirSync(dir)
  .filter((f) => f.startsWith("unicloud-backup-") && f.endsWith(".json"))
  .sort()
  .pop();
if (!file) {
  console.error("no backup JSON found — run: node scripts/backup.mjs");
  process.exit(1);
}
const b = JSON.parse(readFileSync(`${dir}/${file}`, "utf8"));

/** Single-quote a value for SQL, or NULL. */
const q = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const bool = (v) => (v ? "true" : "false");

const users = b.tables.profiles ?? [];
const orgs = b.tables.organizations ?? [];
const members = b.tables.organization_members ?? [];

const out = [];
out.push(`-- Generated from ${file} by scripts/gen-restore-users.mjs`);
out.push(`-- Recreates auth users, the organization, profiles and memberships`);
out.push(`-- with their ORIGINAL uuids so the data restore keeps every FK valid.`);
out.push(`-- Temp password for EVERY account: ${TEMP_PW}  (forced change on first login)`);
out.push(`-- Run this in the SQL Editor of the NEW project, AFTER schema-all.sql.`);
out.push(``);
out.push(`set search_path = public, extensions, auth;`);
out.push(``);
out.push(`-- The signup trigger would reject these inserts (invite-only, migration 0010)`);
out.push(`-- and would also substitute its own org/profile rows. We cannot disable the`);
out.push(`-- trigger itself — auth.users is owned by supabase_auth_admin, so`);
out.push(`-- "alter table auth.users disable trigger" fails with 42501 must be owner.`);
out.push(`-- The trigger FUNCTION lives in public and is ours, so swap it for a no-op`);
out.push(`-- and put the real one back at the end (verbatim from migration 0010).`);
out.push(`create or replace function public.handle_new_user()`);
out.push(`returns trigger language plpgsql security definer set search_path = public as $$`);
out.push(`begin`);
out.push(`  return new;`);
out.push(`end; $$;`);
out.push(``);

out.push(`-- ---- auth users ----------------------------------------------------`);
for (const u of users) {
  out.push(`insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000', ${q(u.id)}, 'authenticated', 'authenticated',
  ${q((u.email || "").toLowerCase())}, crypt(${q(TEMP_PW)}, gen_salt('bf')),
  now(), ${q(u.created_at)}, now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', ${q(u.full_name)}),
  '', '', '', ''
) on conflict (id) do nothing;`);
  out.push(`insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  ${q(u.id)}, ${q(u.id)},
  jsonb_build_object('sub', ${q(u.id)}, 'email', ${q((u.email || "").toLowerCase())}),
  'email', now(), now(), now()
) on conflict do nothing;`);
  out.push(``);
}

out.push(`-- ---- organization ---------------------------------------------------`);
for (const o of orgs) {
  out.push(`insert into public.organizations (id, name, created_by, created_at)
values (${q(o.id)}, ${q(o.name)}, ${q(o.created_by)}, ${q(o.created_at)})
on conflict (id) do update set name = excluded.name;`);
}
out.push(``);

out.push(`-- ---- profiles (must_change_password forced: the password is temporary) --`);
for (const p of users) {
  out.push(`insert into public.profiles (id, full_name, email, avatar_url, created_at, must_change_password)
values (${q(p.id)}, ${q(p.full_name)}, ${q(p.email)}, ${q(p.avatar_url)}, ${q(p.created_at)}, true)
on conflict (id) do update set
  full_name = excluded.full_name, email = excluded.email,
  must_change_password = true;`);
}
out.push(``);

out.push(`-- ---- memberships ----------------------------------------------------`);
for (const m of members) {
  out.push(`insert into public.organization_members (id, org_id, user_id, role, created_at, app_role, department)
values (${q(m.id)}, ${q(m.org_id)}, ${q(m.user_id)}, ${q(m.role)}::public.member_role, ${q(m.created_at)}, ${q(m.app_role)}, ${q(m.department)})
on conflict (org_id, user_id) do update set
  role = excluded.role, app_role = excluded.app_role, department = excluded.department;`);
}
out.push(``);

out.push(`-- ---- put the real signup trigger back (verbatim from migration 0010) ----`);
out.push(`create or replace function public.handle_new_user()
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
end; $$;`);
out.push(``);
out.push(`-- Verify: expect ${users.length} users / ${members.length} memberships / ${orgs.length} org,`);
out.push(`-- and handle_new_user restored (the 'invite_required' text must be present).`);
out.push(`select
  (select count(*) from auth.users)                                        as users,
  (select count(*) from auth.identities)                                   as identities,
  (select count(*) from public.profiles)                                   as profiles,
  (select count(*) from public.organizations)                              as orgs,
  (select count(*) from public.organization_members)                       as members,
  (select pg_get_functiondef('public.handle_new_user()'::regprocedure)
          like '%invite_required%')                                        as trigger_restored;`);
out.push(``);
out.push(`select p.email, p.full_name, m.role, m.app_role, m.department
from public.organization_members m join public.profiles p on p.id = m.user_id
order by m.created_at;`);

const dest = `${dir}/restore-users.sql`;
writeFileSync(dest, out.join("\n"), "utf8");
console.log(`source backup : ${file}`);
console.log(`users         : ${users.length}`);
console.log(`organizations : ${orgs.length}`);
console.log(`memberships   : ${members.length}`);
console.log(`temp password : ${TEMP_PW}`);
console.log(`\n-> ${dest}`);
