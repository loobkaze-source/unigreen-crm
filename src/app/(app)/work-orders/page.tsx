import { getSessionContext } from "@/lib/data";
import { assetCode } from "@/lib/asset";
import { WorkOrdersView } from "./work-orders-view";

export default async function WorkOrdersPage() {
  const { supabase, org } = await getSessionContext();

  const [
    { data: workOrders },
    { data: technicians },
    { data: companies },
    { data: contacts },
    { data: sites },
    { data: assets },
    { data: woAssets },
  ] = await Promise.all([
    supabase
      .from("work_orders")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false }),
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
      .from("work_order_assets")
      .select("work_order_id, equipment_id")
      .eq("org_id", org.id),
  ]);

  const assetIdsByWo: Record<string, string[]> = {};
  for (const r of woAssets ?? []) {
    (assetIdsByWo[r.work_order_id] ??= []).push(r.equipment_id);
  }

  return (
    <WorkOrdersView
      workOrders={workOrders ?? []}
      technicians={technicians ?? []}
      companies={companies ?? []}
      contacts={(contacts ?? []).map((c) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" "),
        company_id: c.company_id,
      }))}
      assetIdsByWo={assetIdsByWo}
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
