-- ============================================================================
--  Deal department boards: Unigreen / Product Sales / Services Sales
--  Adds a `department` column and back-fills existing (Venio) deals from the
--  team noted in `notes`. Safe to re-run.
-- ============================================================================

alter table public.deals
  add column if not exists department text not null default 'unigreen';

create index if not exists idx_deals_department on public.deals(org_id, department);

-- Back-fill from the Venio team embedded in the deal notes:
--   Product Sales  -> product_sales
--   Enigeering DV  -> services_sales
--   Admin          -> unigreen (default)
update public.deals set department = 'product_sales'
  where notes like '%ทีม: Product Sales%';
update public.deals set department = 'services_sales'
  where notes like '%ทีม: Enigeering DV%';
update public.deals set department = 'unigreen'
  where notes like '%ทีม: Admin%';
