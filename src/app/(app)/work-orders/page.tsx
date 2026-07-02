import { getSessionContext, rows } from "@/lib/data";
import { assetCode } from "@/lib/asset";
import { WorkOrdersView } from "./work-orders-view";

const WO_PAGE_LIMIT = 200;

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { supabase, org } = await getSessionContext();
  const search = ((await searchParams).q ?? "").trim();

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
    const ors = [`title.ilike.%${term}%`, `site_address.ilike.%${term}%`];
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
    casesRes,
    woAssetsRes,
  ] = await Promise.all([
    woQuery,
    supabase
      .from("technicians")
      .select("id, name")
      .eq("org_id", org.id)
      .eq("active", true)
      .order("name"),
    supabase.from("companies").select("id, name").eq("org_id", org.id).order("name"),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, company_id")
      .eq("org_id", org.id)
      .order("first_name"),
    supabase
      .from("sites")
      .select("id, name, company_id, address, map_url")
      .eq("org_id", org.id)
      .order("name"),
    supabase
      .from("equipment")
      .select("id, code, name, asset_type, brand, serial_number, project_number, site_id")
      .eq("org_id", org.id)
      .order("code"),
    supabase
      .from("cases")
      .select("id, number, subject, company_id")
      .eq("org_id", org.id)
      .order("number", { ascending: false }),
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
  const cases = rows(casesRes);
  const woAssets = rows(woAssetsRes);

  const caseList = (cases ?? []).map((c) => ({
    id: c.id,
    company_id: c.company_id,
    name: `${c.number ? `CASE-${String(c.number).padStart(4, "0")}` : "เคส"} · ${c.subject}`,
  }));

  const assetIdsByWo: Record<string, string[]> = {};
  for (const r of woAssets ?? []) {
    (assetIdsByWo[r.work_order_id] ??= []).push(r.equipment_id);
  }

  return (
    <WorkOrdersView
      workOrders={workOrders ?? []}
      initialQuery={search}
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
