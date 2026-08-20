import { getSessionContext, fetchAll } from "@/lib/data";
import { AssetsView } from "./assets-view";

export default async function AssetsPage() {
  const { supabase, org } = await getSessionContext();

  const [equipment, sites, groups, openWos] = await Promise.all([
    fetchAll(() =>
      supabase
        .from("equipment")
        .select(
          "id, code, asset_tag, site_id, group_id, name, asset_type, category, status, brand, model, serial_number, project_number, warranty_months, warranty_start, install_date"
        )
        .eq("org_id", org.id)
        .order("code", { ascending: true })
        .order("id")
    ),
    fetchAll(() =>
      supabase.from("sites").select("id, name").eq("org_id", org.id).order("id")
    ),
    fetchAll(() =>
      supabase.from("asset_groups").select("id, name").eq("org_id", org.id).order("id")
    ),
    // Open (not finished) work orders -> "กำลังซ่อม/มีงานค้าง" indicator.
    // The linked assets ride along embedded; a second .in(...1000 ids) query
    // would blow the URL length limit and silently return nothing.
    fetchAll(() =>
      supabase
        .from("work_orders")
        .select("id, asset_id, work_order_assets(equipment_id)")
        .eq("org_id", org.id)
        .not("status", "in", "(completed,cancelled)")
        .order("id")
    ),
  ]);

  const inServiceIds = new Set<string>();
  for (const w of openWos) {
    if (w.asset_id) inServiceIds.add(w.asset_id as string);
    const links = (w as { work_order_assets?: { equipment_id: string }[] })
      .work_order_assets;
    links?.forEach((l) => inServiceIds.add(l.equipment_id));
  }

  return (
    <AssetsView
      equipment={equipment}
      sites={sites}
      groups={groups}
      inServiceIds={[...inServiceIds]}
    />
  );
}
