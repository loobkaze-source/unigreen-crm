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
out.push(`-- and would also create its own org/profile rows. Restore ours verbatim instead.`);
out.push(`alter table auth.users disable trigger on_auth_user_created;`);
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

out.push(`alter table auth.users enable trigger on_auth_user_created;`);
out.push(``);
out.push(`-- Verify`);
out.push(`select p.email, p.full_name, m.role, m.app_role, m.department
from public.organization_members m join public.profiles p on p.id = m.user_id
order by m.created_at;`);
out.push(`-- expected: ${members.length} rows${bool(true) ? "" : ""}`);

const dest = `${dir}/restore-users.sql`;
writeFileSync(dest, out.join("\n"), "utf8");
console.log(`source backup : ${file}`);
console.log(`users         : ${users.length}`);
console.log(`organizations : ${orgs.length}`);
console.log(`memberships   : ${members.length}`);
console.log(`temp password : ${TEMP_PW}`);
console.log(`\n-> ${dest}`);
