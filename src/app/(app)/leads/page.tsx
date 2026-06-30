import { getSessionContext } from "@/lib/data";
import { LeadsView } from "./leads-view";

export default async function LeadsPage() {
  const { supabase, org } = await getSessionContext();

  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false });

  return <LeadsView leads={leads ?? []} />;
}
