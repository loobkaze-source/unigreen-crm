-- 0048: A round is served when its work order is finished, not when someone
-- ticked it.
--
-- service_visits carried its own status, so a contract could read 3/4 with no
-- job to show for any of them — the tick was the only evidence, and it was one
-- click from being wrong in either direction. The job is the evidence: it has
-- the technician, the parts, the photos and the customer's signature on it.
--
-- The visit's own `status` is left alone for now — the service board reads it to
-- decide what to offer, and a round nobody will serve can still be marked
-- skipped — but it no longer decides whether a round counts as served.

create or replace view public.contract_visit_stats
with (security_invoker = true) as
select
  v.contract_id,
  v.org_id,
  count(*)::int                                             as total,
  (count(*) filter (where w.status = 'completed'))::int      as done,
  -- The next round still owed: the earliest whose job is not finished.
  min(v.due_date) filter (where w.status is distinct from 'completed') as next_due
from public.service_visits v
left join public.work_orders w on w.id = v.work_order_id
group by v.contract_id, v.org_id;
