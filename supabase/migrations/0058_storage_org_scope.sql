-- 0058 — Scope both storage buckets to the caller's organization.
--
-- Until now the four policies on each bucket only checked bucket_id:
--   * SELECT was granted to role "public", so anyone holding the anon key (it
--     ships in the browser bundle) could LIST every object and then download it
--     — customer signatures, site photos, repair-notice PDFs.
--   * INSERT / UPDATE / DELETE were open to every signed-in user, whatever org
--     the object belonged to.
--
-- Every object the app writes lives at `<org_id>/<record_id>/<file>`, so the
-- first path segment says which org owns it. The policies now require the
-- caller to be a member of that org, and drop anonymous access entirely.
--
-- The buckets stay public: the app renders files through
-- /storage/v1/object/public/… URLs, which are served without consulting these
-- policies. What goes away is enumerating the bucket — a file can only be
-- fetched by someone who already has its (unguessable) URL.

-- First path segment as a uuid, or null when it isn't one — a cast inside the
-- policy itself would raise on any odd object name and break the whole query.
create or replace function public.storage_object_org(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1)
         ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then split_part(object_name, '/', 1)::uuid
  end
$$;

-- ---- wo-photos (work-order photos + customer signatures) -------------------
drop policy if exists "wo_photos_read" on storage.objects;
drop policy if exists "wo_photos_insert" on storage.objects;
drop policy if exists "wo_photos_update" on storage.objects;
drop policy if exists "wo_photos_delete" on storage.objects;

create policy "wo_photos_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'wo-photos'
         and public.is_org_member(public.storage_object_org(name)));

create policy "wo_photos_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'wo-photos'
              and public.is_org_member(public.storage_object_org(name)));

create policy "wo_photos_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'wo-photos'
         and public.is_org_member(public.storage_object_org(name)))
  with check (bucket_id = 'wo-photos'
              and public.is_org_member(public.storage_object_org(name)));

create policy "wo_photos_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'wo-photos'
         and public.is_org_member(public.storage_object_org(name)));

-- ---- case-files (case photos / PDFs) ---------------------------------------
drop policy if exists "case_files_read" on storage.objects;
drop policy if exists "case_files_insert" on storage.objects;
drop policy if exists "case_files_update" on storage.objects;
drop policy if exists "case_files_delete" on storage.objects;

create policy "case_files_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'case-files'
         and public.is_org_member(public.storage_object_org(name)));

create policy "case_files_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'case-files'
              and public.is_org_member(public.storage_object_org(name)));

create policy "case_files_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'case-files'
         and public.is_org_member(public.storage_object_org(name)))
  with check (bucket_id = 'case-files'
              and public.is_org_member(public.storage_object_org(name)));

create policy "case_files_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'case-files'
         and public.is_org_member(public.storage_object_org(name)));
