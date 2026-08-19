-- ============================================================================
--  equipment.category becomes free text.
--
--  It was an enum of six solar/EV kinds, written when that was the whole
--  business. The service side works on petrol-station equipment and files a
--  machine by what it is — Probe, Liquid Sensor, Nozzle (หัวฉีด), Tank
--  Calibration — 68 kinds and counting, none of which an enum can hold without
--  a migration every time the field adds one.
--
--  The six existing values are unchanged and still mean what they meant; they
--  are simply no longer the only ones allowed. No CHECK is added: the point is
--  that the vocabulary lives in the data, and both places that render this
--  already fall back to showing the raw value.
-- ============================================================================
alter table public.equipment
  alter column category type text using category::text;

alter table public.equipment
  alter column category set default 'other';

create index if not exists idx_equipment_category on public.equipment(org_id, category);
