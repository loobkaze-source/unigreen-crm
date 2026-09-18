import { getSessionContext, rows, fetchAllRes } from "@/lib/data";
import { WarrantiesView } from "./warranties-view";

export default async function WarrantiesPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const { supabase, org } = await getSessionContext();
  // ?site=<id> — arrived from a site's own page, asking about that site only.
  const { site: scopeSiteId } = await searchParams;

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
        .select("id, name, company_id")
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
      scopeSite={rows(sitesRes).find((s) => s.id === scopeSiteId) ?? null}
    />
  );
}
