import { getSessionContext, rows, fetchAll } from "@/lib/data";
import { AssetsView } from "./assets-view";

export default async function AssetsPage() {
  const { supabase, org } = await getSessionContext();

  const [equipment, sites, groups, openWoRes] = await Promise.all([
    fetchAll(() =>
      supabase
        .from("equipment")
        .select(
          "id, code, asset_tag, site_id, group_id, name, asset_type, category, status, brand, model, serial_number, project_number, warranty_months, warranty_start, install_date"
        )
        .eq("org_id", org.id)
        .order("code", { ascending: true })
    ),
    fetchAll(() => supabase.from("sites").select("id, name").eq("org_id", org.id)),
    fetchAll(() => supabase.from("asset_groups").select("id, name").eq("org_id", org.id)),
    // Open (not finished) work orders -> "กำลังซ่อม/มีงานค้าง" indicator
    supabase
      .from("work_orders")
      .select("id, asset_id")
      .eq("org_id", org.id)
      .not("status", "in", "(completed,cancelled)")
      .limit(1000),
  ]);

  const openWos = rows(openWoRes);
  const inServiceIds = new Set<string>(
    openWos.map((w) => w.asset_id as string).filter(Boolean)
  );
  const openWoIds = openWos.map((w) => w.id as string);
  if (openWoIds.length) {
    const { data: links } = await supabase
      .from("work_order_assets")
      .select("equipment_id")
      .in("work_order_id", openWoIds);
    (links ?? []).forEach((l) => inServiceIds.add(l.equipment_id as string));
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
