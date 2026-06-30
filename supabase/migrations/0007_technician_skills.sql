-- ============================================================================
--  Technician skills (multi-select text[]) + nickname. Safe to re-run.
-- ============================================================================

alter table public.technicians
  add column if not exists skills text[] not null default '{}';

alter table public.technicians
  add column if not exists nickname text;

-- migrate any existing single skill value into the array
update public.technicians
  set skills = array[skill]
  where skill is not null and btrim(skill) <> ''
    and (skills is null or skills = '{}');
