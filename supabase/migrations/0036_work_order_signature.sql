-- 0036: The customer's signature on a finished job.
--
-- A technician closing a job on site needs the customer to sign for it, and
-- until now that happened on paper and never reached the CRM. The drawing is
-- kept in the wo-photos bucket beside the job's photos; the row records where,
-- who signed, and when — so a job can be asked whether it was signed off
-- without fetching an image to find out.

alter table public.work_orders
  add column if not exists signature_path text,
  add column if not exists signed_by text,
  add column if not exists signed_at timestamptz;
