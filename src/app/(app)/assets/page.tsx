import { getSessionContext, rows } from "@/lib/data";
import { AssetsView } from "./assets-view";

export default async function AssetsPage() {
  const { supabase, org } = await getSessionContext();

  const [equipmentRes, sitesRes, groupsRes] = await Promise.all([
    supabase
      .from("equipment")
      .select("*")
      .eq("org_id", org.id)
      .order("code", { ascending: true })
      .limit(1000),
    supabase.from("sites").select("id, name").eq("org_id", org.id).limit(1000),
    supabase.from("asset_groups").select("id, name").eq("org_id", org.id).limit(1000),
  ]);

  return (
    <AssetsView
      equipment={rows(equipmentRes)}
      sites={rows(sitesRes)}
      groups={rows(groupsRes)}
    />
  );
}
