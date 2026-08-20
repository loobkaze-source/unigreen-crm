import { getSessionContext, rows, fetchAllRes } from "@/lib/data";
import { CompaniesView } from "./companies-view";

export default async function CompaniesPage() {
  const { supabase, org } = await getSessionContext();

  // fetchAll: this IS the company register — PostgREST's silent 1,000-row cap
  // must not decide which customers appear in it.
  const companies = rows(
    await fetchAllRes(() =>
      supabase
        .from("companies")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false })
        .order("id")
    )
  );

  return <CompaniesView companies={companies} />;
}
