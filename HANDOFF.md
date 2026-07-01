# Unicloud CRM — Project Handoff / Status

> Complete working notes so this project can be continued on another machine.
> Last updated: 2026-07-01. This file lives **in the repo** so it travels with a folder copy.
> **No secrets are stored here** — real keys live in `.env.local` (gitignored, but it copies
> with the folder). The GitHub repo is **public**, so never commit keys/passwords.

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

## 2. Run on a new computer

The Supabase project is in the **cloud** and the data already exists there, so you usually only need:

```bash
npm install
npm run dev          # http://localhost:3000
```

Requirements: Node 20+ (Netlify uses 22). `.env.local` must be present (it copies with the
folder; if missing, recreate from `.env.example` with the Supabase URL + keys).

`npm run dev` uses `.env.local`. **Do not** rely on `netlify build`/`netlify deploy` on Windows
— the OpenNext adapter fails locally ("Failed publishing static content"). Deploy via git push (§4).

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

**Deploy gotchas (already resolved, keep them true):**
- Netlify free plan blocks builds of PRIVATE repos via deploy-key → repo is PUBLIC **and** the
  Netlify site's `repo.private` was set false via API. Don't flip the repo back to private.
- Commits should be authored as **vasawat@unigreen.solar** (the Netlify account email; git config set locally).
- Manual build trigger if needed: `POST /api/v1/sites/{id}/builds` with the Netlify token.
- Check deploy state via `GET /api/v1/sites/unicloudcrm.netlify.app/deploys` (needs the token).

---

## 5. Modules (all built)

Sales: Leads, Contacts, Companies, Deals (dnd-kit Kanban, 3 department boards), Activities, Dashboard.
FSM: Technicians (multi-skill + nickname-as-avatar), Work Orders (checklist/photos/schedule).
Phase 2: Sites, Equipment (by serial), Service Contracts (auto-generate visits), Warranties.
Support: Cases. Catalog: Products. Admin: **Users** (roles + departments + invites), **Account**
(self-service password change).

Nav lives in `src/components/app/app-shell.tsx`.

---

## 6. Architecture & key files

- `src/lib/data.ts` — `getSessionContext()` → `{supabase, userId, email, profile, org, role,
  appRole, department, isAdmin}`. Resolves the user's OLDEST membership; self-heals a workspace if none.
- `src/lib/departments.ts` — shared `DEPARTMENTS` const (unigreen / product_sales / services_sales).
- `src/lib/roles.ts` — shared `USER_ROLES` const (admin/Sales/Manager/Technician/Job Dispatcher/Accounting).
- `src/middleware.ts` + `src/lib/supabase/middleware.ts` — session refresh + auth guard.
- Roles/departments model: **1 workspace, departments + roles** (customers shared across
  departments; deals/work scoped per department). `admin` (owner or app_role=admin) sees all;
  Manager/Sales/Dispatcher are pinned to one department. `app_role=admin` ⇔ membership `role=admin`
  (RLS `is_org_admin`) kept in sync by `updateMember`/`inviteMember`/the signup trigger.
- Invites: admin invites by email in `/users`; the `handle_new_user` trigger routes an invited
  email into the org (with role/department) on signup instead of creating a personal workspace.
- Deals board (`src/app/(app)/deals/deals-board.tsx`): admins see all 3 board tabs; a
  department-scoped user sees only their board.
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

## 8. Pending tasks

- Assign a **department** to each of the 7 seeded users in `/users` (currently null → they see all boards).
- Set the department the Manager (Thatchai) oversees.
- Team members change their temp password `123456` at `/account`.
- (Optional) Rename the workspace "Unigreen Power" → "Unicloud" — SQL:
  `update public.organizations set name='Unicloud' where name='Unigreen Power';`
- (Security) Rotate the GitHub PAT, Netlify token, and Supabase keys used during setup; keep the
  service_role key server-side only.

---

## 9. Secrets

Local only, in `.env.local` (gitignored): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (currently a placeholder — fill from
Supabase → Project Settings → API if you need admin scripts). GitHub + Netlify tokens are not
stored in the repo. **Never commit any of these to the public repo.**
