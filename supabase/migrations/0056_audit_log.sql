-- 0056: Every change to a record is written down.
--
-- Who renamed the customer, when the site's address changed, what a job's
-- status was before somebody set it back — questions that come up months
-- later and had no answer. Now each table that holds a record people argue
-- about carries a trigger, and the trigger writes what changed, who changed it
-- and when, before the change is even committed.
--
-- In the database rather than in the app, because the app is not the only
-- thing that writes: the import scripts do, and so does anyone with the SQL
-- editor open. A log that only the app fills in is a log with holes in it.
--
-- Updates store only the columns that changed — a work order has forty
-- columns and a status change is one of them. Inserts store the whole new
-- row, deletes the whole old one; that is what you want back when the wrong
-- thing was deleted.

create table if not exists public.audit_log (
  id             bigint generated always as identity primary key,
  org_id         uuid not null,
  table_name     text not null,
  row_id         uuid not null,
  action         text not null check (action in ('insert', 'update', 'delete')),
  changed_at     timestamptz not null default now(),
  -- Null when the change came from a script or the SQL editor rather than a
  -- signed-in person; the log says "ระบบ" for those.
  changed_by     uuid,
  changed_fields text[] not null default '{}',
  before         jsonb,
  after          jsonb
);

create index if not exists idx_audit_row on public.audit_log(table_name, row_id, changed_at desc);
create index if not exists idx_audit_org_time on public.audit_log(org_id, changed_at desc);

alter table public.audit_log enable row level security;
drop policy if exists audit_log_member_read on public.audit_log;
create policy audit_log_member_read on public.audit_log for select to authenticated
  using (public.is_org_member(org_id));
-- Nobody inserts by hand; the trigger does, as definer.
grant select on public.audit_log to authenticated;

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old     jsonb;
  v_new     jsonb;
  v_before  jsonb := '{}'::jsonb;
  v_after   jsonb := '{}'::jsonb;
  v_fields  text[] := '{}';
  v_key     text;
  v_org     uuid;
  v_id      uuid;
  v_actor   uuid;
begin
  -- auth.uid() is null under the service role, which is how the scripts run.
  begin
    v_actor := auth.uid();
  exception when others then
    v_actor := null;
  end;

  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_org := (v_new ->> 'org_id')::uuid;
    v_id  := (v_new ->> 'id')::uuid;
    insert into public.audit_log (org_id, table_name, row_id, action, changed_by, changed_fields, before, after)
    values (v_org, tg_table_name, v_id, 'insert', v_actor,
            array(select jsonb_object_keys(v_new)), null, v_new);
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_org := (v_old ->> 'org_id')::uuid;
    v_id  := (v_old ->> 'id')::uuid;
    insert into public.audit_log (org_id, table_name, row_id, action, changed_by, changed_fields, before, after)
    values (v_org, tg_table_name, v_id, 'delete', v_actor,
            array(select jsonb_object_keys(v_old)), v_old, null);
    return old;
  end if;

  -- UPDATE: only what actually changed. updated_at moves on every save and
  -- says nothing on its own.
  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  for v_key in select jsonb_object_keys(v_new) loop
    if v_key <> 'updated_at' and (v_old -> v_key) is distinct from (v_new -> v_key) then
      v_fields := v_fields || v_key;
      v_before := v_before || jsonb_build_object(v_key, v_old -> v_key);
      v_after  := v_after  || jsonb_build_object(v_key, v_new -> v_key);
    end if;
  end loop;
  -- A save that changed nothing is not an event.
  if array_length(v_fields, 1) is null then
    return new;
  end if;

  v_org := (v_new ->> 'org_id')::uuid;
  v_id  := (v_new ->> 'id')::uuid;
  insert into public.audit_log (org_id, table_name, row_id, action, changed_by, changed_fields, before, after)
  values (v_org, tg_table_name, v_id, 'update', v_actor, v_fields, v_before, v_after);
  return new;
end;
$$;

-- The records people argue about. Child rows (a job's photos, its parts) are
-- left out: they change a dozen times a visit and the job itself is the story.
do $$
declare t text;
begin
  foreach t in array array[
    'companies', 'contacts', 'sites', 'equipment',
    'work_orders', 'cases', 'service_contracts', 'warranties', 'technicians'
  ] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.audit_row()', t);
  end loop;
end $$;
