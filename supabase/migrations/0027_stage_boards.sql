-- 0027: Per-board (per-department) pipeline stages. Each board owns its own
-- editable set of sales stages. Won and Missed are permanent (locked) — they
-- can't be renamed, reordered, or deleted. Cancelled and any custom stage are
-- fully editable.

-- Which board (department) a stage belongs to. Existing stages -> 'unigreen'.
alter table public.stages
  add column if not exists board_key text not null default 'unigreen';

-- Permanent stages the UI must never let the operator remove/rename/reorder.
alter table public.stages
  add column if not exists locked boolean not null default false;

create index if not exists idx_stages_board on public.stages(org_id, board_key, position);

-- Lock the canonical terminal stages on existing boards: Won + Missed.
update public.stages set locked = true where is_won = true;
update public.stages set locked = true where is_lost = true and lower(name) = 'missed';

-- Seed the two boards that currently have no stages of their own, so they are
-- usable out of the box: an Open column plus the permanent Won / Missed.
do $$
declare
  o record;
  b text;
begin
  for o in select id as org_id from public.organizations loop
    foreach b in array array['product_sales','services_sales'] loop
      if not exists (
        select 1 from public.stages
        where org_id = o.org_id and board_key = b
      ) then
        insert into public.stages (org_id, name, position, is_won, is_lost, board_key, locked)
        values
          (o.org_id, 'Open',   1,   false, false, b, false),
          (o.org_id, 'Won',    100, true,  false, b, true),
          (o.org_id, 'Missed', 101, false, true,  b, true);
      end if;
    end loop;
  end loop;
end $$;
