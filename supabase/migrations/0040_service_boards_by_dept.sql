-- 0040: Service Boards become the three departments that run the field work.
--
-- The service side was sharing the sales side's list — unigreen, product_sales,
-- services_sales — which is not how the work is actually divided. It is divided
-- the way the case codes already say it is: MRD, UNG, ETD.
--
-- unigreen is UNG under another name, so its work orders, contracts and board
-- members move across intact. The service-board members filed under the two
-- sales boards have no obvious counterpart and land on the default; an admin
-- can move them in one screen at ตั้งค่า · Service Board.
--
-- The sales boards themselves are untouched: board_assignments rows with
-- board_type = 'pipeline' still point at the DEPARTMENTS list, as do deals.

update public.work_orders set board_key = 'UNG' where board_key = 'unigreen';
update public.service_contracts set board_key = 'UNG' where board_key = 'unigreen';

update public.board_assignments
set board_key = 'UNG'
where board_type = 'service' and board_key = 'unigreen';

-- Someone on both sales boards would collide on the way to MRD; drop the copy
-- rather than fail the migration over a duplicate membership.
delete from public.board_assignments a
where a.board_type = 'service'
  and a.board_key in ('product_sales', 'services_sales')
  and exists (
    select 1 from public.board_assignments b
    where b.org_id = a.org_id
      and b.board_type = 'service'
      and b.board_key = 'MRD'
      and b.user_id = a.user_id
  );

update public.board_assignments
set board_key = 'MRD'
where board_type = 'service' and board_key in ('product_sales', 'services_sales');
