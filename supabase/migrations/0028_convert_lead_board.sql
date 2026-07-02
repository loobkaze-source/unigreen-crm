-- 0028: Make convert_lead board-aware. Since stages are now per board
-- (migration 0027), "first stage by position" alone could pick a stage from
-- another board than the deal's, leaving the converted deal invisible on its
-- board. Pin lead conversion to the default 'unigreen' board: pick its first
-- *open* stage and set the deal's department to match.

create or replace function public.convert_lead(p_lead_id uuid)
  returns uuid
  language plpgsql
  set search_path to 'public'
as $function$
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
  v_board      text := 'unigreen';
begin
  select * into v_lead from leads where id = p_lead_id for update;
  if not found then
    raise exception 'ไม่พบลูกค้ามุ่งหวัง';
  end if;
  if v_lead.status = 'converted' then
    raise exception 'ลูกค้ามุ่งหวังนี้ถูกแปลงแล้ว';
  end if;

  -- First open stage of the default board (fall back to any stage on it).
  select id into v_stage_id
  from stages
  where org_id = v_lead.org_id
    and board_key = v_board
  order by (is_won or is_lost) asc, position asc
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

  insert into deals (org_id, title, value, currency, stage_id, department, company_id, contact_id)
  values (v_lead.org_id, v_title, coalesce(v_lead.value, 0), 'THB', v_stage_id, v_board, v_company_id, v_contact_id)
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
$function$;
