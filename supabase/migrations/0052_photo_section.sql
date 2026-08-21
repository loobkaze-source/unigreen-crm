-- 0052: Site photos gather under headings.
--
-- A report page of twelve pictures is a page of pipes. What turns it into
-- evidence is the line above them — "รูปก่อนทำงาน", then "รูปหลังทำงาน" —
-- because the pair is the proof, not either picture on its own.
--
-- The heading lives on the photo rather than in a table of its own. Photos
-- join a heading by being dragged under it, and a heading with nothing left
-- beneath it has nothing left to say, so it goes with the last photo.

alter table public.work_order_photos
  add column if not exists section text;

comment on column public.work_order_photos.section is
  'Heading this photo prints under, e.g. รูปก่อนทำงาน. Null = no heading.';

-- Photos added since 0050 all sat at position 0 and were only kept in order by
-- created_at breaking the tie. Give them the numbers they were being shown in,
-- so "the next photo goes at the end" means something.
with ordered as (
  select id, row_number() over (
    partition by work_order_id order by position, created_at
  ) - 1 as n
  from public.work_order_photos
)
update public.work_order_photos p
set position = ordered.n
from ordered
where ordered.id = p.id and p.position is distinct from ordered.n;
