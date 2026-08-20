-- 0051: Covering indexes for every foreign key that lacked one.
--
-- Straight from the Supabase performance linter (unindexed_foreign_keys,
-- 2026-08-21). Two things pay for these:
--   * embedded selects — the app now resolves names/links with PostgREST
--     embeds (companies(name), work_order_assets(equipment_id), …), which
--     join through exactly these columns;
--   * cascading deletes — removing a company/site/case walks every child
--     table by these FKs, and without an index each one is a seq scan.
-- Purely additive; safe to run on the live project at any time.

create index if not exists idx_activities_company        on public.activities(company_id);
create index if not exists idx_activities_contact        on public.activities(contact_id);
create index if not exists idx_activities_deal           on public.activities(deal_id);
create index if not exists idx_activities_lead           on public.activities(lead_id);
create index if not exists idx_activities_owner          on public.activities(owner_id);

create index if not exists idx_asset_groups_org          on public.asset_groups(org_id);
create index if not exists idx_board_assignments_user    on public.board_assignments(user_id);
create index if not exists idx_case_assets_org           on public.case_assets(org_id);
create index if not exists idx_case_attachments_org      on public.case_attachments(org_id);

create index if not exists idx_cases_company             on public.cases(company_id);
create index if not exists idx_cases_contact             on public.cases(contact_id);
create index if not exists idx_cases_owner               on public.cases(owner_id);
create index if not exists idx_cases_supporter           on public.cases(supporter_id);

create index if not exists idx_companies_owner           on public.companies(owner_id);
create index if not exists idx_contact_companies_org     on public.contact_companies(org_id);
create index if not exists idx_contacts_owner            on public.contacts(owner_id);

create index if not exists idx_deals_company             on public.deals(company_id);
create index if not exists idx_deals_contact             on public.deals(contact_id);
create index if not exists idx_deals_owner               on public.deals(owner_id);

create index if not exists idx_invites_created_by        on public.invites(created_by);

create index if not exists idx_leads_conv_company        on public.leads(converted_company_id);
create index if not exists idx_leads_conv_contact        on public.leads(converted_contact_id);
create index if not exists idx_leads_conv_deal           on public.leads(converted_deal_id);
create index if not exists idx_leads_owner               on public.leads(owner_id);

create index if not exists idx_orgs_created_by           on public.organizations(created_by);

create index if not exists idx_contracts_company         on public.service_contracts(company_id);
create index if not exists idx_contracts_site            on public.service_contracts(site_id);
create index if not exists idx_contracts_technician      on public.service_contracts(technician_id);
create index if not exists idx_visits_work_order         on public.service_visits(work_order_id);

create index if not exists idx_sites_contact             on public.sites(contact_id);
create index if not exists idx_technicians_user          on public.technicians(user_id);

create index if not exists idx_warranties_company        on public.warranties(company_id);
create index if not exists idx_warranties_site           on public.warranties(site_id);

create index if not exists idx_wo_assets_org             on public.work_order_assets(org_id);
create index if not exists idx_wo_items_org              on public.work_order_items(org_id);
create index if not exists idx_wo_parts_org              on public.work_order_parts(org_id);
create index if not exists idx_wo_photos_org             on public.work_order_photos(org_id);
create index if not exists idx_wo_report_counters_case   on public.work_order_report_counters(case_id);
create index if not exists idx_wo_techs_org              on public.work_order_technicians(org_id);

create index if not exists idx_work_orders_company       on public.work_orders(company_id);
create index if not exists idx_work_orders_contact       on public.work_orders(contact_id);
create index if not exists idx_work_orders_case          on public.work_orders(case_id);
create index if not exists idx_work_orders_accepted_by   on public.work_orders(accepted_by);
create index if not exists idx_work_orders_deal          on public.work_orders(deal_id);
create index if not exists idx_work_orders_owner         on public.work_orders(owner_id);
