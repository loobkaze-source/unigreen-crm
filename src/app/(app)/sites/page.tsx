import { getSessionContext, rows } from "@/lib/data";
import { SitesView } from "./sites-view";

export default async function SitesPage() {
  const { supabase, org } = await getSessionContext();

  const [sitesRes, companiesRes, contactsRes] =
    await Promise.all([
      supabase
        .from("sites")
        // equipment(count) = per-site count aggregated in the DB, not a fetch
        // of every equipment row.
        .select("*, equipment(count)")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase.from("companies").select("id, name").eq("org_id", org.id).order("name"),
      supabase
        .from("contacts")
        .select("id, first_name, last_name")
        .eq("org_id", org.id)
        .order("first_name"),
    ]);

  const sites = rows(sitesRes);
  const companies = rows(companiesRes);
  const contacts = rows(contactsRes);

  return (
    <SitesView
      sites={sites.map(({ equipment, ...s }) => ({
        ...s,
        equipmentCount: equipment?.[0]?.count ?? 0,
      }))}
      companies={companies ?? []}
      contacts={(contacts ?? []).map((c) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" "),
      }))}
    />
  );
}
