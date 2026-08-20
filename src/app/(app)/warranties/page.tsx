import { getSessionContext, rows, fetchAllRes } from "@/lib/data";
import { WarrantiesView } from "./warranties-view";

export default async function WarrantiesPage() {
  const { supabase, org } = await getSessionContext();

  const [warrantiesRes, companiesRes, sitesRes] = await Promise.all([
    fetchAllRes(() =>
      supabase
        .from("warranties")
        .select("*")
        .eq("org_id", org.id)
        .order("end_date", { ascending: true, nullsFirst: false })
        .order("id")
    ),
    fetchAllRes(() =>
      supabase
        .from("companies")
        .select("id, name")
        .eq("org_id", org.id)
        .order("name")
        .order("id")
    ),
    fetchAllRes(() =>
      supabase
        .from("sites")
        .select("id, name")
        .eq("org_id", org.id)
        .order("name")
        .order("id")
    ),
  ]);

  return (
    <WarrantiesView
      warranties={rows(warrantiesRes)}
      companies={rows(companiesRes)}
      sites={rows(sitesRes)}
    />
  );
}
