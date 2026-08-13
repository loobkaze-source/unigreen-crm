-- 0032: Costed materials (+ store withdrawals) and a field note from the technician.
--
-- Parts previously recorded only a name and a quantity, so a job could not say
-- what the replacement actually cost. `unit` and `unit_price` make each line
-- add up; the total is derived (qty * unit_price) rather than stored, so it can
-- never drift from the line items.
--
-- `technician_remark` is the technician's own note from site, kept separate
-- from `description` (which is the dispatcher's brief when the job is created).

alter table public.work_order_parts
  add column if not exists unit text,
  add column if not exists unit_price numeric(12,2),
  -- 'material' = วัสดุที่ใช้ในงาน, 'store' = ของที่เบิกจาก store ของบริษัท.
  -- One table, two cards: the lines are identical in shape and both are
  -- consumed on the job, so splitting them into separate tables would only
  -- duplicate every query and every total.
  add column if not exists source text not null default 'material'
    check (source in ('material', 'store'));

create index if not exists idx_wo_parts_source
  on public.work_order_parts(work_order_id, source);

alter table public.work_orders
  add column if not exists technician_remark text;
