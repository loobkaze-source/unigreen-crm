# Unicloud CRM — Project Handoff / Status

> Complete working notes so this project can be continued on another machine.
> Last updated: 2026-08-13. This file lives **in the repo** so it travels with a folder copy.
> **No secrets are stored here** — real keys live in `.env.local` (gitignored, but it copies
> with the folder). The GitHub repo is **public**, so never commit keys/passwords.
> **Start here after moving machines → §2.**

---

## 1. What this is

**Unicloud CRM** (originally scaffolded "Pulse", branded "Unigreen", now **Unicloud**) — a
Supabase-backed CRM modeled on VenioCRM. The whole UI is in **Thai**; currency is **THB (฿)**.

**Stack:** Next.js 16.2.9 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4
(`@theme` in `src/app/globals.css`) · Supabase (Postgres + Auth + RLS + Storage) · font Noto Sans Thai.

- Supabase clients are **untyped** (`@supabase/ssr`, no `<Database>` generic) — hand-written
  types in `src/lib/database.types.ts`.
- Multi-tenant: `organizations` + `organization_members` + RLS. `SECURITY DEFINER` helpers
  `is_org_member` / `is_org_admin` avoid RLS recursion.

---

## 2. Move to another computer / run there

**The database is NOT in this folder.** Supabase is a cloud project, so the new machine talks to
the same live data the moment `.env.local` is in place. You do **not** re-run migrations (§3 is
only for a brand-new Supabase project).

### 2a. Move the folder

Copy the **whole `c:\CRM` folder** (a plain copy — USB / network share / cloud drive). Prefer this
over `git clone`, because a clone leaves out gitignored files you actually need:

| Item | Copy of folder | `git clone` |
|---|---|---|
| `.env.local` (Supabase URL + anon + service-role key) | ✅ travels | ❌ **missing** — recreate from `.env.example` |
| `supabase/import_*.sql` (real customer data) | ✅ travels | ❌ missing |
| `backups/*.json` | ✅ travels | ❌ missing |
| `node_modules`, `.next` | ✅ but **delete them** — rebuild instead | ❌ (correct) |
| source, migrations, this file | ✅ | ✅ |

Safe to delete before copying (they rebuild, and they're big): `node_modules/`, `.next/`,
`.netlify/`, `tsconfig.tsbuildinfo`.

### 2b. Start working on the new machine

```bash
cd c:\CRM
npm install          # Node 20+ (Netlify builds on 22)
npm run dev          # http://localhost:3000
```

Then verify: `npx tsc --noEmit` and a login at localhost:3000. If login fails, `.env.local` is
missing or wrong — recreate it from `.env.example` (Supabase → Project Settings → API).

Also set git identity on the new machine (Netlify rejects builds from other contributors, §4):

```bash
git config user.email "vasawat@unigreen.solar"
git config user.name  "Vasawat Mekaew"
```

`npm run dev` uses `.env.local`. **Do not** rely on `netlify build`/`netlify deploy` on Windows
— the OpenNext adapter fails locally ("Failed publishing static content"). Deploy via git push (§4).

### 2c. Claude Code's memory does NOT travel

Claude's auto-memory lives **outside** this folder, at
`C:\Users\<you>\.claude\projects\c--CRM\memory\` — a folder copy will not bring it. Two options:

1. **Do nothing** — this HANDOFF.md is the source of truth; Claude reads it and picks up the context.
2. **Bring it along** — copy that `memory\` folder to the same path on the new machine, and keep
   the project at **`c:\CRM`** (the folder name `c--CRM` is derived from the project path — put the
   project somewhere else and Claude looks in a differently-named folder).

Either way, tell Claude to read `HANDOFF.md` first on the new machine.

---

## 3. Supabase — SQL run order

Only needed on a **fresh** Supabase project (the current cloud DB already has all of this applied).
Open Supabase → **SQL Editor** and run in order:

**Migrations** (`supabase/migrations/`, tracked in git):
1. `0001_init.sql` — core schema + RLS + triggers (workspace + Thai pipeline stages on signup)
2. `0002_fsm.sql` — technicians, work_orders, checklist, photos (Storage bucket `wo-photos`)
3. `0003_contracts_warranty_sites.sql` — sites, equipment, contact↔company M2M, service contracts/visits, warranties
4. `0004_cases_products.sql` — cases + products
5. `0005_deal_department.sql` — `deals.department` (boards: unigreen / product_sales / services_sales)
6. `0006_customer_code.sql` — `companies.customer_code` (Venio รหัสลูกค้า — the linking key)
7. `0007_technician_skills.sql` — `technicians.skills text[]` + `nickname`
8. `0008_user_roles.sql` — `organization_members.app_role`; sets vasawat=admin
9. `0009_departments_invites.sql` — `organization_members.department`, `invites` table,
   `handle_new_user` honours invites, renames workspace to "Unigreen Power"
10. `0010_invite_only.sql` — signup is **invite-only**: `handle_new_user` rejects any email
    without a pending invite (except bootstrapping the first workspace on a fresh, org-less DB)
11. `0011_admin_user_mgmt.sql` — `profiles.must_change_password` (forces a password change on
    first login) + `mark_password_changed()` RPC; backfills the flag for all non-owner members
12. `0012_board_assignments.sql` — `board_assignments` (admins assign users to pipeline/service
    boards per department); renames legacy role "Job Dispatcher" → "Dispatcher"
13. `0013_assets_service_fields.sql` — equipment→asset (`asset_type` object/project,
    `project_number`, `warranty_months`, `warranty_start`); work_orders `job_class` (CM/PM),
    `billing` (warranty/paid), `asset_id`, `board_key`; service_contracts `board_key`
14. `0014_asset_code.sql` — `equipment.code` (per-org sequential AS-0001, trigger + backfill):
    the unique Asset ID (serial numbers aren't globally unique — can collide across brands)
15. `0015_work_order_site.sql` — `work_orders.site_id` (FK to sites) for the WO
    customer→site→asset cascade
16. `0016_work_order_assets.sql` — `work_order_assets` M2M (a WO can involve many
    assets; backfilled from the single `asset_id`)
17. `0017_work_order_case.sql` — `work_orders.case_id` (FK cases); a case can't be
    closed while it has unfinished work orders (guard in cases/actions.ts)
18. `0018_technician_user.sql` — `technicians.user_id` (links a technician row to an auth user)
19. `0019_asset_groups.sql` — `asset_groups` (named groups of assets within a site)
20. `0020_customer_tax_tags.sql` — `companies.tax_id` + `tags text[]` (+ GIN index)
21. `0021_convert_lead_fn.sql` — `convert_lead(p_lead_id)` fn: atomic lead→company/contact/deal
    conversion (row lock kills double-convert); `deals.currency` default → THB
22. `0022_aggregates.sql` — `contract_visit_stats` view + `dashboard_stats(p_org)` fn (SQL
    aggregation for the dashboard & contract list instead of full-table fetches)
23. `0023_case_site_supporter_attachments.sql` — cases `site_id` + `supporter_id` (Technical
    Supporter user), `case_attachments` table + `case-files` storage bucket (images/PDF);
    opening/managing cases is gated to Customer Service / Dispatcher / admin (CASE_ROLES)
24. `0024_work_order_parts.sql` — `work_order_parts` (parts replaced per WO, optional
    equipment link); powers the /assets lifetime pages ("เปลี่ยนอะไหล่ไปกี่รอบ")
25. `0025_asset_status.sql` — `equipment.status` (operational/degraded/down/retired,
    see lib/asset-status.ts) + `cases.equipment_id`. Status flows: case form sets it
    when reporting a problem; completing a repair WO restores degraded/down →
    operational; manual override on /assets/[id] (Dispatcher/admin; retire = admin)
26. `0026_case_assets.sql` — `case_assets` (many assets per case, each with a reported
    condition). Case form flow: pick customer → filter sites → tick affected assets
    (checkbox, more can be added later after inspection). `cases.equipment_id` kept in
    sync with the first linked asset for backward compatibility.
27. `0027_stage_boards.sql` — per-board pipeline stages: `stages.board_key` (department)
    + `stages.locked` (Won/Missed are permanent — no rename/reorder/delete). Existing
    stages → 'unigreen'; product_sales / services_sales seeded with Open/Won/Missed.
    Admins manage stages inline on /deals (deals/stage-actions.ts, admin-gated).
28. `0028_convert_lead_board.sql` — convert_lead is now board-aware: converts into the
    'unigreen' board's first open stage and sets deals.department accordingly (so the
    new deal lands on a matching board after the 0027 per-board split).
29. `0029_technician_certifications.sql` — `technicians.certifications` text[] (safety
    "ใบเซอร์": จป.หัวหน้างาน / จป.ที่สูง / จป.ไฟฟ้า / จป.ที่อับอากาศ …; preset chips +
    custom entry in the technician form). Also added the "Safety" app role (lib/roles.ts).
30. `0030_multi_role.sql` — a member can hold **several roles at once**:
    `organization_members.app_roles text[]` (+ GIN index) and `invites.app_roles`, backfilled from
    the single `app_role`, which is kept mirrored to the primary role ('admin' if held, else the
    first) so older queries still work. `handle_new_user` copies the whole set from the invite.
    Ask "does this member hold role X" via the helpers in `lib/roles.ts`
    (`hasRole` / `primaryRole` / `isDeptScoped` / `isTechnicianOnly`) rather than comparing a
    single string. Two consequences worth knowing: a **department** applies when *any* held role is
    department-scoped, and the reduced technician nav only kicks in when Technician is that
    member's **only** role.

**Dates:** all displayed dates use `src/lib/format.ts` `fmtDate` (DD-MM-YYYY) / `fmtDateTime`
(DD-MM-YYYY HH:mm), Gregorian year. Prefer these over date-fns/พ.ศ. for new date output.

**Supabase Auth settings (dashboard):** turn **Confirm email = OFF** (Authentication → Sign In /
Providers → Email) and set **Site URL = https://unicloudcrm.netlify.app** + add it to Redirect URLs
(Authentication → URL Configuration). Otherwise confirmation links point to `localhost:3000`.

**Data imports** (`supabase/import_*.sql`, **gitignored** — contain real customer data/emails,
but copy with the folder). Run AFTER migrations:
- `import_venio.sql` — 192 deals + 102 companies + 57 cases + 14 products
- `import_customers.sql` — 375 companies (customer_code) + 246 contacts + 111 sites
- `import_users.sql` — 7 team accounts (pw `123456`); **run AFTER 0009** (needs invites table)

> **Org-targeting gotcha:** imports resolve the org by the OLDEST membership of
> `vasawat@uniwave.co.th` (`email ilike 'vasawat@uniwave%'`, `order by created_at asc`). Targeting
> any other org silently puts data in an invisible workspace.

Also in Supabase Auth settings: **turn OFF "Confirm email"** (built-in email is rate-limited).

---

## 4. Deployment (Netlify)

- Live: **https://unicloudcrm.netlify.app** (site `unicloudcrm`, account `vasawat-wx3l7a`; renamed from `unigreen-crm-th` on 2026-07-01)
- Code: GitHub **loobkaze-source/unigreen-crm** (branch `main`) — **PUBLIC** repo
- `git push` to `main` → Netlify auto-builds on Linux (`@netlify/plugin-nextjs`). Env vars set on the Netlify site.

**Functions region = Asia Pacific (Singapore, `sin`)** — changed from the `cmh` (Ohio)
default. Every page is server-rendered, so all Supabase queries run from the function region:
with compute in Ohio and the DB in Mumbai each query crossed the planet (~200ms), and the Thai
user base was ~230ms from the compute. Set in the **Netlify UI** (Project configuration → Build &
deploy → Continuous deployment → Functions region) — it is a site-level setting, *not* in
`netlify.toml` — and it needs a **redeploy** to apply. Requires a Netlify **Pro** plan.

> **Rule of thumb:** keep the function region and the Supabase region together. Both are now in
> Singapore (the DB was moved out of Mumbai on 2026-08-13 — see §10), so a query from a server
> component costs ~20ms instead of ~200ms.

**Deploy key:** Netlify pulls the repo over SSH with a deploy key. If builds start failing at
`preparing repo` with `git@github.com: Permission denied (publickey)`, the key was removed from the
GitHub repo — re-link the repository in Netlify (Build & deploy → Continuous deployment), or add
Netlify's public deploy key back under GitHub → repo Settings → Deploy keys. This happened once
while rotating GitHub credentials, and three deploys failed silently before anyone noticed: the
site kept serving the previous build, so the app looked fine while the new code never shipped.
Check with `npx netlify-cli api listSiteDeploys --data '{"site_id":"<id>"}'`.

**Deploy gotchas (already resolved, keep them true):**
- Netlify free plan blocks builds of PRIVATE repos via deploy-key → repo is PUBLIC **and** the
  Netlify site's `repo.private` was set false via API. Don't flip the repo back to private.
- Commits should be authored as **vasawat@unigreen.solar** (the Netlify account email; git config set locally).
- Manual build trigger if needed: `POST /api/v1/sites/{id}/builds` with the Netlify token.
- Check deploy state via `GET /api/v1/sites/unicloudcrm.netlify.app/deploys` (needs the token).

---

## 5. Modules (all built)

Sales: Leads, Contacts, Companies, Deals (dnd-kit Kanban, 3 department boards), Activities, Dashboard.
FSM: Technicians (multi-skill + nickname-as-avatar + safety certs "ใบเซอร์"), Work Orders
(checklist/photos/schedule/parts).
Phase 2: Sites, Equipment (by serial), Service Contracts (auto-generate visits), Warranties.
Support: Cases. Catalog: Products. Admin: **Users** (roles + departments + invites), **Account**
(self-service password change).

**Asset** (`/assets`, `/assets/[id]`): per-asset lifetime page — delivery date, warranty start/end,
repair rounds, parts replaced, timeline. Asset operating status (operational / degraded / down /
retired, `src/lib/asset-status.ts`) is set from the case form, auto-restored to operational when a
repair WO completes, and manually overridable on the asset page (Dispatcher/admin; retire = admin).

**Pipeline stages are per board and admin-editable** (migration 0027): on `/deals` an admin can
add / rename / reorder / delete a board's stages inline. **Won and Missed are locked** (permanent);
Cancelled and custom stages are deletable (a stage that still holds deals can't be deleted).

**Cases are multi-asset** (migration 0026): the form goes customer → that customer's sites →
checkbox list of the site's assets, each with a reported condition. More assets can be added later
after an inspection by editing the case.

**UI conventions:** every main list table has per-column sort + filter (shared
`src/components/ui/data-table.tsx` — `useDataTable` / `DataTableHead` / `DataTableFilterToggle`).
**Dark mode** is a toggle (`theme-toggle.tsx`, `localStorage` key `theme`, `<html class="dark">`
with a pre-paint inline script in `layout.tsx`; token overrides under `.dark` in `globals.css`).
Loading screens show one of four random energy-themed SVG animations
(`src/components/ui/loading-art.tsx`).

Nav lives in `src/components/app/app-shell.tsx`.

---

## 6. Architecture & key files

- `src/lib/data.ts` — `getSessionContext()` → `{supabase, userId, email, profile, org, role,
  appRole, department, isAdmin}`. Resolves the user's OLDEST membership; self-heals a workspace if none.
- `src/lib/departments.ts` — shared `DEPARTMENTS` const (unigreen / product_sales / services_sales).
- `src/lib/roles.ts` — shared consts: `USER_ROLES` (admin / Sales / Manager / Technician /
  Dispatcher / Technical Supporter / Customer Service / Accounting / **Safety**),
  `CASE_ROLES` (Customer Service + Dispatcher may open/manage cases), `PIPELINE_ROLES`,
  `SERVICE_ROLES`, `DEPT_ROLES`. Admin bypasses every role gate.
- `src/middleware.ts` + `src/lib/supabase/middleware.ts` — session refresh + auth guard.
- Roles/departments model: **1 workspace, departments + roles** (customers shared across
  departments; deals/work scoped per department). `admin` (owner or app_role=admin) sees all;
  Manager/Sales/Dispatcher are pinned to one department. `app_role=admin` ⇔ membership `role=admin`
  (RLS `is_org_admin`) kept in sync by `updateMember`/`inviteMember`/the signup trigger.
- Invites: admin invites by email in `/users`; the `handle_new_user` trigger routes an invited
  email into the org (with role/department) on signup instead of creating a personal workspace.
- Deals board (`src/app/(app)/deals/deals-board.tsx`): admins see all 3 board tabs; a
  department-scoped user sees only their board.
- Role-based nav (`src/lib/nav-access.ts` + `app-shell.tsx`): a member whose **only** role is
  Technician (see `isTechnicianOnly`) sees **just `/my-jobs`** — customers, sites, assets, the
  org-wide work-order list, contracts and products are all hidden, and they land there instead of
  the dashboard. The work-order **detail** route stays reachable so a job can actually be worked
  (checklist / photos / parts); `work-orders/[id]/page.tsx` then `notFound()`s any job not assigned
  to their `technicians` row, which is the check that actually holds against a guessed URL.
  Someone who is Technician *and* something else keeps the full nav. `/users` is admin-only.
- Branding: `src/app/globals.css` (`@theme` tokens, azure blue #2A72E0 / #2563EB, navy sidebar).
  Logos in `public/brand/` (`logo-dark.png` white wordmark for dark bg, `logo-light.png` blue for
  light bg). App icon `src/app/icon.png` + `src/app/favicon.ico` (white cloud on blue). Cloud
  loading spinner in `src/components/ui/spinner.tsx`. Brand source art in `brand/`.

---

## 7. Hard-won gotchas (don't relearn these)

1. **NEVER `export const <value>` from a `"use server"` file that a Client Component imports.**
   Next turns every export of a use-server module into a *server-action reference*, so a plain
   array becomes a function → `USER_ROLES.map is not a function` crashed the whole `/users` page
   (HTTP still 200 because the shell streamed first → React `$RX` → browser "This page couldn't
   load"). Fix: keep shared consts in plain modules (`src/lib/roles.ts`, `src/lib/departments.ts`).
   Debugging tip: a streamed RSC error still returns 200 — fetch the page with a real member's SSR
   cookies and grep the body for `$RX(` / missing header text, or run `next dev` to see the stack.
2. **Enum casts in PL/pgSQL:** `organization_members.role` is enum `member_role`. A bare `'member'`
   literal auto-casts, but a `CASE ... END` returns `text` and must be cast: `(...)::public.member_role`.
3. **Untyped Supabase client** — do NOT add the `<Database>` generic (caused `never` types). Query
   errors return in `.error` (don't throw).
4. **Email is rate-limited** (Supabase built-in ~2–4/hr). The `/forgot` email-OTP reset needs a
   **custom SMTP** (Auth → SMTP Settings) + `{{ .Token }}` in the Magic-Link template to show a
   numeric code. For the seeded team, prefer login + change password at `/account` (no email).
5. **"Unigreen" is still a department name** (a deal board) — that's a business unit, NOT the brand.
   The brand is Unicloud. Don't rename the `unigreen` department value.

---

## 8. Current state & pending tasks

**As of 2026-08-13:** migrations `0001`–`0029` are applied; the database lives in the **Singapore**
Supabase project `ciuvozghgryjxvifrqzl` (the old Mumbai project `tkhyojqywrxuuvbjeznx` was still
around at the time of writing — delete it once you are happy). Netlify functions also run in
Singapore. See §10 for the move and the numbers.

> **Every account has the temporary password `Uniwave#2026`** and `must_change_password = true`,
> because password hashes could not be carried across projects. The app forces a reset at
> `/set-password` on first login. The new project also has a new JWT secret, so every previous
> session was invalidated — everyone signs in again.

- Tell the 7 team members to sign in and set a real password.
- Delete the old Mumbai Supabase project once production has been exercised for a while.
- Assign a **department** to each member in `/users` (null → they see all boards).
- (Security) Rotate the GitHub PAT, Netlify token, and Supabase keys used during setup; keep the
  service_role key server-side only.
- (Perf, optional) `src/lib/supabase/middleware.ts` calls `auth.getUser()` on every request — a
  full round trip before rendering. Verifying the JWT locally would remove it; see §10.

---

## 9. Secrets

Local only, in `.env.local` (gitignored): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. GitHub + Netlify tokens are not
stored in the repo. **Never commit any of these to the public repo.**

**`SUPABASE_SERVICE_ROLE_KEY` is now REQUIRED** for in-app admin user management (create user + set
password, reset password — `src/lib/supabase/admin.ts`, used only by server actions). Get it from
Supabase → Project Settings → API → `service_role` `secret`. Set it in **both** `.env.local` AND
**Netlify → Site configuration → Environment variables** (server-side only — it has NO
`NEXT_PUBLIC_` prefix, so it never reaches the browser). Without it, /users shows a warning and
create/reset are disabled (self-service password change and forced first-login change still work).

**Username login (no email):** usernames are stored as internal emails `<username>@unicloud.local`
(`src/lib/username.ts`: `toAuthEmail` maps a login id → email, `displayUsername` strips the domain
for display). Login and admin `createUser` accept a plain username OR a real email; existing
real-email accounts keep logging in with their email. All user-facing displays use `displayUsername`.

**User model (admin-managed, no email):** admins create users in `/users` with an initial password;
new users are forced to `/set-password` on first login (gated by `must_change_password` in the
`(app)` layout via `getSessionContext`). Password reset is admin-only (`resetUserPassword` → sets a
new temp password + re-flags must-change). The email-OTP self-reset (`/forgot`) was removed.

---

## 10. Regions & latency

The app is **server-rendered**, so nearly all Supabase traffic is `Netlify Function → Supabase`,
not `browser → Supabase`. Latency is dominated by the distance between the **function region** and
the **database region** — keep them together.

| | Region | Where it's set |
|---|---|---|
| Compute (Next.js SSR + server actions) | Asia Pacific **Singapore** (`sin`) | Netlify UI → Functions region (Pro plan; needs redeploy) — see §4 |
| Database + Storage (Supabase) | Southeast Asia **Singapore** (`ap-southeast-1`) | Fixed at project creation |

Both moved on 2026-08-13. Measured from production afterwards (`/auth/diag` probe, since removed):

| | before (Ohio + Mumbai) | after (Singapore + Singapore) |
|---|---|---|
| function → Supabase | ~200 ms | **18–23 ms** |
| `/login` server time (warm, TLS excluded) | ~515–675 ms | **~323–341 ms** |

**The remaining ~320ms is not the database.** With queries at ~20ms, the rest is per-request
overhead: `src/lib/supabase/middleware.ts` calls `supabase.auth.getUser()` on **every** request,
which is a full network round trip to Supabase Auth before the page even renders, plus Next.js
render and Netlify function init. Cutting it further means changing code (e.g. verifying the JWT
locally instead of calling the auth server), not moving regions again.

> **Measurement trap that cost time here:** latency probes that ignore the HTTP status. A wrong
> API key returns `401` *fast*, which looks like a great result. Always assert `HTTP 200` before
> believing a timing number.

### Moving a Supabase project to another region

Supabase has **no in-place region change** — create a new project and migrate. This was done once
(Mumbai → Singapore, 2026-08-13) and the tooling is kept for next time:

1. New project in the target region.
2. SQL Editor → **`backups/schema-all.sql`** (all migrations concatenated; also creates the
   `wo-photos` / `case-files` buckets). Regenerate after adding migrations:
   `for f in supabase/migrations/*.sql; do cat "$f"; done > backups/schema-all.sql`
3. `node scripts/backup.mjs` against the OLD project → JSON of all 28 tables.
4. `node scripts/gen-restore-users.mjs [tempPassword]` → **`backups/restore-users.sql`**; paste it
   into the new project. It recreates the auth users with their **original uuids** (so every
   `owner_id` / `supporter_id` / `user_id` still resolves), plus the org, profiles and memberships.
5. Point `.env.local` at the new project, then
   `SOURCE_ENV_FILE=<old .env.local> node scripts/restore.mjs --confirm` — the other 24 tables plus
   the storage objects.
6. `node scripts/verify-restore.mjs` — compares every table count against the backup and HEADs
   each file. Expect "every table and file matches".
7. Update the three Netlify env vars, redeploy, verify, then delete the old project.

**Gotchas hit during the real run:**
- `alter table auth.users disable trigger …` fails with `42501 must be owner` — auth.users belongs
  to `supabase_auth_admin`. Swap `public.handle_new_user()` for a no-op instead and restore it
  afterwards (gen-restore-users.mjs does this).
- Inserting the organization fires `on_org_created`, which seeds 6 default pipeline stages that are
  not in the backup. `restore.mjs` prunes them before restoring the real ones.
- Passwords do not survive: hashes live in `auth.users`, which the REST API does not expose, so
  everyone gets a temp password and `must_change_password = true`.
- The new project has a **new JWT secret and new API keys** — every session is invalidated, and all
  three env vars must be swapped. Copying the URL and service key but leaving the *old anon key* is
  an easy mistake; it surfaces as "invalid login credentials" in the UI, not as a key error.
- Storage objects must be copied separately (restore.mjs does it via SOURCE_ENV_FILE).
