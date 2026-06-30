import { getSessionContext } from "@/lib/data";
import { TechniciansView } from "./technicians-view";

export default async function TechniciansPage() {
  const { supabase, org } = await getSessionContext();

  const { data: technicians } = await supabase
    .from("technicians")
    .select("*")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false });

  return <TechniciansView technicians={technicians ?? []} />;
}
