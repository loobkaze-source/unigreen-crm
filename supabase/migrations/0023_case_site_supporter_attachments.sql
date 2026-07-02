-- 0023: Cases gain a site, an assigned Technical Supporter, and file
-- attachments (photos / PDFs from repair-notice letters).

alter table public.cases
  add column if not exists site_id      uuid references public.sites(id) on delete set null,
  add column if not exists supporter_id uuid references auth.users(id) on delete set null;
create index if not exists idx_cases_site on public.cases(site_id);

-- ----------------------------------------------------------------------------
--  Attachments (files live in the 'case-files' storage bucket)
-- ----------------------------------------------------------------------------
create table if not exists public.case_attachments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  case_id     uuid not null references public.cases(id) on delete cascade,
  path        text not null,
  name        text,
  mime        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_case_attachments_case on public.case_attachments(case_id);

alter table public.case_attachments enable row level security;
drop policy if exists case_attachments_member_all on public.case_attachments;
create policy case_attachments_member_all on public.case_attachments for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));
grant select, insert, update, delete on public.case_attachments to authenticated;

-- ----------------------------------------------------------------------------
--  Storage: bucket + policies for case attachments (images / PDF)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('case-files', 'case-files', true)
on conflict (id) do nothing;

drop policy if exists case_files_read on storage.objects;
create policy case_files_read on storage.objects for select
  using (bucket_id = 'case-files');

drop policy if exists case_files_insert on storage.objects;
create policy case_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'case-files');

drop policy if exists case_files_update on storage.objects;
create policy case_files_update on storage.objects for update to authenticated
  using (bucket_id = 'case-files');

drop policy if exists case_files_delete on storage.objects;
create policy case_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'case-files');
