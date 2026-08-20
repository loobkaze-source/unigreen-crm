-- 0038: The customer's own work-order number for a case.
--
-- Shell and the other station operators raise a WO on their side and quote its
-- number in every message about the fault. Without somewhere to put it, the
-- number lived in the free-text note where nothing could search for it — and it
-- is the first thing anyone is given when they ring up about a job.

alter table public.cases
  add column if not exists customer_wo_ref text;
