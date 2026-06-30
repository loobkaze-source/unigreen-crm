-- ============================================================================
--  Customer Code (Venio รหัสลูกค้า) on companies — the key that links
--  contacts and sites back to the customer (นิติบุคคล). Safe to re-run.
-- ============================================================================

alter table public.companies
  add column if not exists customer_code text;

create index if not exists idx_companies_customer_code
  on public.companies(org_id, customer_code);
