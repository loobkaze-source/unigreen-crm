-- 0041: A work order can answer a service contract, not only a case.
--
-- Work raised on this system comes from one of two places: a customer reported
-- a fault (a case), or a contract came round to its next visit. The job could
-- only name the first, so the routine half of the work arrived on the board
-- with nothing saying which agreement it was being done under — and nobody
-- could ask a contract what had actually been done for it.
--
-- service_visits.work_order_id already ties a job to one round of a contract.
-- This is the looser link: the contract the job belongs to, whether or not it
-- was raised against a numbered visit.

alter table public.work_orders
  add column if not exists contract_id uuid
    references public.service_contracts(id) on delete set null;

create index if not exists idx_work_orders_contract on public.work_orders(contract_id);
