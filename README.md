# Pulse CRM

A fast, reliable CRM for sales teams — built with **Next.js 16**, **React 19**,
**TypeScript**, **Tailwind v4**, and **Supabase** (Postgres + Auth + Row Level
Security).

## Modules

- **Dashboard** — pipeline value, won revenue, open leads, and upcoming tasks
- **Leads** — capture, qualify, and **convert** a lead into a contact + deal
- **Contacts** — people, linked to companies
- **Companies** — organizations you do business with
- **Deals** — a drag-and-drop **Kanban pipeline**
- **Activities** — tasks, calls, meetings, emails, and notes with due dates

Every record is scoped to an **organization** (workspace) and protected by
Postgres Row Level Security, so tenants can never see each other's data.

## Setup

### 1. Add your Supabase credentials

Copy `.env.example` to `.env.local` and fill in the values from your Supabase
dashboard (**Project Settings → API**):

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>   # optional, for admin scripts
```

> The app only needs the URL + anon key to run; all access goes through the
> authenticated user's session and RLS.

### 2. Create the database schema

Open the Supabase **SQL Editor** and run the contents of
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). This
creates all tables, indexes, triggers, and RLS policies, and seeds a default
pipeline whenever a workspace is created.

### 3. (For quick testing) disable email confirmation

In **Authentication → Sign In / Providers → Email**, turn **"Confirm email"**
off so new sign-ups can log in immediately. Leave it on for production and use
the confirmation email instead.

### 4. Run

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, create an account, and a workspace with a default
pipeline is set up for you automatically.

## How it works

- `src/lib/supabase/{client,server,middleware}.ts` — Supabase clients for the
  browser, Server Components/Actions, and session refresh in middleware.
- `src/lib/data.ts` — resolves the signed-in user + active organization.
- `src/app/(auth)/*` — login / signup.
- `src/app/(app)/*` — the authenticated app; one folder per module, each with a
  Server Component `page.tsx`, `actions.ts` (Server Actions), and a client view.
- `supabase/migrations/0001_init.sql` — the full schema + security model.

## Tech notes

- Mutations use **Server Actions** with `revalidatePath`; the Kanban board does
  optimistic drag-and-drop and reverts on error.
- Optional type generation: once your project is live you can replace the
  hand-written `src/lib/database.types.ts` with
  `supabase gen types typescript --project-id <ref> > src/lib/database.types.ts`.
