-- 0050: Site photos keep an order of their own.
--
-- They came out in upload order, which is the order a phone happened to finish
-- sending them — not the order the visit happened in, and not the order that
-- makes sense on the report: the fault, then the part, then the repair. The
-- report prints them in this order too, so the second page tells the story the
-- technician meant to tell.

alter table public.work_order_photos
  add column if not exists position integer not null default 0;

create index if not exists idx_wo_photos_order
  on public.work_order_photos(work_order_id, position, created_at);

-- Existing photos keep the order they have, so nothing moves under anyone.
with ordered as (
  select id, row_number() over (partition by work_order_id order by created_at) - 1 as n
  from public.work_order_photos
)
update public.work_order_photos p
set position = ordered.n
from ordered
where ordered.id = p.id;
