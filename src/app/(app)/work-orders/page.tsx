import { getSessionContext, rows, fetchAllRes } from "@/lib/data";
import { assetCode } from "@/lib/asset";
import { loadCaseOptions } from "./case-options";
import { loadContractOptions } from "./contract-options";
import { WorkOrdersView } from "./work-orders-view";

const WO_PAGE_LIMIT = 200;

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; case?: string; visit?: string }>;
}) {
  const { supabase, org } = await getSessionContext();
  const sp = await searchParams;
  const search = (sp.q ?? "").trim();
  // Arriving from a case that has just been opened — see cases-view.
  const fromCase = (sp.case ?? "").trim() || null;
  // Arriving from a contract round that wants a job raising for it.
  const fromVisit = (sp.visit ?? "").trim() || null;

  // Newest WO_PAGE_LIMIT rows; ?q= searches server-side so older rows stay
  // reachable as the table grows.
  let woQuery = supabase
    .from("work_orders")
    .select("*")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(WO_PAGE_LIMIT);
  if (search) {
    // Escape ilike wildcards; drop chars that would break the .or() syntax.
    const term = search.replace(/[%_]/g, "\\$&").replace(/[,()]/g, " ").trim();
    // The code people quote is the report number now, so search that too.
    const ors = [
      `title.ilike.%${term}%`,
      `report_no.ilike.%${term}%`,
      `site_address.ilike.%${term}%`,
    ];
    const digits = search.replace(/\D/g, "");
    if (digits) ors.push(`number.eq.${Number(digits)}`);
    woQuery = woQuery.or(ors.join(","));
  }

  const [
    woRes,
    techRes,
    companiesRes,
    contactsRes,
    sitesRes,
    assetsRes,
    woAssetsRes,
  ] = await Promise.all([
    woQuery,
    supabase
      .from("technicians")
      .select("id, name")
      .eq("org_id", org.id)
      .eq("active", true)
      .order("name")
        .limit(500),
    fetchAllRes(() =>
      supabase.from("companies").select("id, name").eq("org_id", org.id).order("name")
    ),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, company_id")
      .eq("org_id", org.id)
      .order("first_name")
        .limit(500),
    fetchAllRes(() =>
      supabase
        .from("sites")
        .select("id, name, company_id, address, map_url")
        .eq("org_id", org.id)
        .order("name")
    ),
    fetchAllRes(() =>
      supabase
        .from("equipment")
        .select("id, code, name, asset_type, brand, serial_number, project_number, site_id")
        .eq("org_id", org.id)
        .order("code")
    ),
    supabase
      .from("work_order_assets")
      .select("work_order_id, equipment_id")
      .eq("org_id", org.id),
  ]);

  const workOrders = rows(woRes);
  const technicians = rows(techRes);
  const companies = rows(companiesRes);
  const contacts = rows(contactsRes);
  const sites = rows(sitesRes);
  const assets = rows(assetsRes);
  const woAssets = rows(woAssetsRes);

  const caseList = await loadCaseOptions(supabase, org.id);
  const contractList = await loadContractOptions(supabase, org.id);
  const visitRes = fromVisit
    ? await supabase
        .from("service_visits")
        .select("id, seq, due_date, contract_id")
        .eq("id", fromVisit)
        .eq("org_id", org.id)
        .maybeSingle()
    : { data: null };

  const assetIdsByWo: Record<string, string[]> = {};
  for (const r of woAssets ?? []) {
    (assetIdsByWo[r.work_order_id] ??= []).push(r.equipment_id);
  }

  return (
    <WorkOrdersView
      workOrders={workOrders ?? []}
      initialQuery={search}
      initialCaseId={fromCase}
      initialVisit={
        visitRes.data
          ? {
              id: visitRes.data.id as string,
              seq: visitRes.data.seq as number,
              due_date: visitRes.data.due_date as string,
              contract_id: visitRes.data.contract_id as string,
            }
          : null
      }
      limitHit={(workOrders ?? []).length === WO_PAGE_LIMIT}
      technicians={technicians ?? []}
      companies={companies ?? []}
      contacts={(contacts ?? []).map((c) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" "),
        company_id: c.company_id,
      }))}
      assetIdsByWo={assetIdsByWo}
      cases={caseList}
      contracts={contractList}
      sites={sites ?? []}
      assets={(assets ?? []).map((a) => {
        const ident =
          a.asset_type === "project" ? a.project_number : a.serial_number;
        const brand = a.asset_type === "object" && a.brand ? ` (${a.brand})` : "";
        return {
          id: a.id,
          site_id: a.site_id,
          name: `${assetCode(a.code)} · ${a.name}${ident ? ` · ${ident}` : ""}${brand}`,
        };
      })}
    />
  );
}
