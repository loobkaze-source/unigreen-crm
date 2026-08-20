-- 0043: ประเภทงาน becomes the kind of machine the job is about.
--
-- The five values in the enum described the shape of the visit — survey,
-- installation, maintenance, repair — which the job already says twice over:
-- CM/PM says whether it is corrective, and the six ticks on the service report
-- say what was done. What nobody could say was which system the job was on,
-- and that is what a service company sorts its work by: ATG, VRU, dispensers,
-- submersible pumps.
--
-- Free text rather than a new enum, as equipment.category went in 0034: the
-- list of machines a station holds grows, and it should grow in the app rather
-- than in a migration each time.

alter table public.work_orders
  alter column type drop default,
  alter column type type text using type::text;

alter table public.work_orders
  alter column type set default 'atg_fafnir';

-- Nothing else referenced it.
drop type if exists public.work_order_type;
