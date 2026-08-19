-- ============================================================================
--  Asset tag (เลขครุภัณฑ์ / QR code) — the sticker on the machine.
--
--  Distinct from equipment.code: that is the per-org running number this system
--  issues (AS-0001) and cannot be chosen, while this is the number already
--  printed on the asset and scanned in the field. Imported equipment arrives
--  carrying tags like "Shell-001" or "ISN-00000001".
--
--  Not unique: the legacy tags repeat across brands, and a hard constraint
--  would block the very import that brings them in. Safe to re-run.
-- ============================================================================
alter table public.equipment add column if not exists asset_tag text;

create index if not exists idx_equipment_asset_tag
  on public.equipment(org_id, asset_tag);
