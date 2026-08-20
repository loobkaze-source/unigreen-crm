-- 0035: What machines each site holds, aggregated in the database.
--
-- /sites can now be narrowed to the sites that have a given kind of machine.
-- Working that out in Node would mean pulling all 5,877 equipment rows on every
-- page load only to reduce them to two or three values per site; this returns
-- those values directly, one row per site.
--
-- security_invoker so equipment's own RLS decides what a member may see, as
-- with contract_visit_stats (0022).
create or replace view public.site_asset_facets
with (security_invoker = true) as
select
  e.org_id,
  e.site_id,
  count(*)::int as total,
  -- The legacy asset list wrote "-" where a field was not recorded. It is not a
  -- brand, and leaving it in would put it at the top of every filter — 2,296
  -- machines carry it — ahead of the names somebody might actually look for.
  array_agg(distinct btrim(e.category))
    filter (where btrim(coalesce(e.category, '')) not in ('', '-')) as kinds,
  array_agg(distinct btrim(e.brand))
    filter (where btrim(coalesce(e.brand, '')) not in ('', '-')) as brands,
  array_agg(distinct btrim(e.model))
    filter (where btrim(coalesce(e.model, '')) not in ('', '-')) as models
from public.equipment e
where e.site_id is not null
group by e.org_id, e.site_id;
