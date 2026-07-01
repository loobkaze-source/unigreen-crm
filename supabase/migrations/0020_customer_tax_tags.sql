-- ============================================================================
--  Customers (companies): Tax ID + free-form Tags (many per customer, for
--  filtering — e.g. Shell / PTT / BCP / บ้าน / โรงงาน / โรงแรม). Safe to re-run.
-- ============================================================================
alter table public.companies
  add column if not exists tax_id text,
  add column if not exists tags   text[] not null default '{}';

-- GIN index for fast "has tag" filtering.
create index if not exists idx_companies_tags on public.companies using gin(tags);
