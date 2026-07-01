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
    { data: assets },
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
      .select("id, first_name, last_name")
      .eq("org_id", org.id)
      .order("first_name"),
    supabase
      .from("equipment")
      .select("id, code, name, asset_type, brand, serial_number, project_number")
      .eq("org_id", org.id)
      .order("code"),
  ]);

  return (
    <WorkOrdersView
      workOrders={workOrders ?? []}
      technicians={technicians ?? []}
      companies={companies ?? []}
      contacts={(contacts ?? []).map((c) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" "),
      }))}
      assets={(assets ?? []).map((a) => {
        const ident =
          a.asset_type === "project" ? a.project_number : a.serial_number;
        const brand = a.asset_type === "object" && a.brand ? ` (${a.brand})` : "";
        return {
          id: a.id,
          name: `${assetCode(a.code)} · ${a.name}${ident ? ` · ${ident}` : ""}${brand}`,
        };
      })}
    />
  );
}
