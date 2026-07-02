-- 0022: Move dashboard / contract-list aggregation into the database.
-- Replaces fetching entire deals/leads/service_visits tables into Node just
-- to compute sums and counts.

-- Per-contract visit stats (security_invoker so service_visits RLS applies).
create or replace view public.contract_visit_stats
with (security_invoker = true) as
select
  contract_id,
  org_id,
  count(*)::int                                     as total,
  (count(*) filter (where status = 'done'))::int    as done,
  min(due_date) filter (where status = 'pending')   as next_due
from public.service_visits
group by contract_id, org_id;

-- Dashboard aggregates: per-stage deal count/value + open lead count.
create or replace function public.dashboard_stats(p_org uuid)
returns jsonb
language sql
security invoker
stable
set search_path = public
as $$
  select jsonb_build_object(
    'per_stage', coalesce((
      select jsonb_agg(jsonb_build_object(
        'stage_id', t.stage_id,
        'count',    t.cnt,
        'value',    t.val
      ))
      from (
        select stage_id, count(*)::int as cnt, coalesce(sum(value), 0) as val
        from deals
        where org_id = p_org
        group by stage_id
      ) t
    ), '[]'::jsonb),
    'open_leads', (
      select count(*)::int
      from leads
      where org_id = p_org
        and status not in ('converted', 'unqualified')
    )
  );
$$;
