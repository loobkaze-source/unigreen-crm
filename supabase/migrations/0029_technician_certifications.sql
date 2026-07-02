-- 0029: Safety certifications ("ใบเซอร์") for technicians — e.g. จป.หัวหน้างาน,
-- จป.ที่สูง, จป.ไฟฟ้า, จป.ที่อับอากาศ. Free-form list alongside `skills`.

alter table public.technicians
  add column if not exists certifications text[] not null default '{}';
