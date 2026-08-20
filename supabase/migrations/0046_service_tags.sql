-- 0046: The vocabulary a job is closed with, kept where it can be seeded.
--
-- The fault and repair codes are a real catalogue — F01…F25, S01…S19 — that has
-- lived on paper and in the old system's history. Until now the pickers could
-- only suggest what someone had already typed here, which on an empty database
-- is nothing, so the first hundred jobs would have invented their own spellings
-- before any pattern appeared.
--
-- `value` is what gets written onto the work order, code and description
-- together, exactly as it reads on the report: "F01 : ไม่อ่านค่าระดับน้ำมัน".
-- `code` is kept beside it so a year of jobs can be grouped by F01 without
-- parsing the label, and `uses` carries how often the old system saw it, which
-- is the order worth suggesting them in.

create table if not exists public.service_tags (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  kind       text not null check (kind in ('fault', 'repair', 'cause')),
  code       text,
  value      text not null,
  uses       integer not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, kind, value)
);
create index if not exists idx_service_tags_kind on public.service_tags(org_id, kind);

alter table public.service_tags enable row level security;
drop policy if exists service_tags_member_all on public.service_tags;
create policy service_tags_member_all on public.service_tags for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));
grant select, insert, update, delete on public.service_tags to authenticated;
