import { getSessionContext, rows, fetchAllRes } from "@/lib/data";
import { LeadsView } from "./leads-view";

export default async function LeadsPage() {
  const { supabase, org } = await getSessionContext();

  const leads = rows(
    await fetchAllRes(() =>
      supabase
        .from("leads")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false })
        .order("id")
    )
  );

  return <LeadsView leads={leads} />;
}
