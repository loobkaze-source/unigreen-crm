import { getSessionContext } from "@/lib/data";
import { CompaniesView } from "./companies-view";

export default async function CompaniesPage() {
  const { supabase, org } = await getSessionContext();

  const { data: companies } = await supabase
    .from("companies")
    .select("*")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(1000);

  return <CompaniesView companies={companies ?? []} />;
}
