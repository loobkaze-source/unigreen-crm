-- 0021: Atomic lead conversion + THB default currency
-- convert_lead() replaces the multi-step conversion in the server action so a
-- mid-way failure can no longer leave orphaned companies/contacts, and a
-- double-click can no longer convert the same lead twice (row lock + status check).

create or replace function public.convert_lead(p_lead_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lead       leads%rowtype;
  v_stage_id   uuid;
  v_company_id uuid;
  v_contact_id uuid;
  v_deal_id    uuid;
  v_parts      text[];
  v_first      text;
  v_last       text;
  v_title      text;
  v_has_company boolean;
begin
  select * into v_lead from leads where id = p_lead_id for update;
  if not found then
    raise exception 'ไม่พบลูกค้ามุ่งหวัง';
  end if;
  if v_lead.status = 'converted' then
    raise exception 'ลูกค้ามุ่งหวังนี้ถูกแปลงแล้ว';
  end if;

  select id into v_stage_id
  from stages
  where org_id = v_lead.org_id
  order by position asc
  limit 1;
  if v_stage_id is null then
    raise exception 'ไม่พบขั้นตอนไปป์ไลน์ในพื้นที่ทำงานนี้';
  end if;

  v_has_company := v_lead.company_name is not null
               and length(trim(v_lead.company_name)) > 0;

  if v_has_company then
    insert into companies (org_id, name)
    values (v_lead.org_id, v_lead.company_name)
    returning id into v_company_id;
  end if;

  v_parts := regexp_split_to_array(trim(v_lead.name), '\s+');
  v_first := coalesce(v_parts[1], v_lead.name);
  v_last  := nullif(array_to_string(v_parts[2:], ' '), '');

  insert into contacts (org_id, first_name, last_name, email, phone, company_id)
  values (v_lead.org_id, v_first, v_last, v_lead.email, v_lead.phone, v_company_id)
  returning id into v_contact_id;

  v_title := case when v_has_company
    then v_lead.company_name || ' — ' || v_lead.name
    else v_lead.name end;

  insert into deals (org_id, title, value, currency, stage_id, company_id, contact_id)
  values (v_lead.org_id, v_title, coalesce(v_lead.value, 0), 'THB', v_stage_id, v_company_id, v_contact_id)
  returning id into v_deal_id;

  update leads set
    status               = 'converted',
    converted_contact_id = v_contact_id,
    converted_company_id = v_company_id,
    converted_deal_id    = v_deal_id,
    converted_at         = now(),
    updated_at           = now()
  where id = p_lead_id;

  return v_deal_id;
end;
$$;

-- Align the DB default with the UI default (THB, not USD).
alter table public.deals alter column currency set default 'THB';
