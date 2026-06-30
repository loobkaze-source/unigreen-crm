import { getSessionContext } from "@/lib/data";
import { SitesView } from "./sites-view";

export default async function SitesPage() {
  const { supabase, org } = await getSessionContext();

  const [{ data: sites }, { data: companies }, { data: contacts }, { data: equipment }] =
    await Promise.all([
      supabase
        .from("sites")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false }),
      supabase.from("companies").select("id, name").eq("org_id", org.id).order("name"),
      supabase
        .from("contacts")
        .select("id, first_name, last_name")
        .eq("org_id", org.id)
        .order("first_name"),
      supabase.from("equipment").select("id, site_id").eq("org_id", org.id),
    ]);

  const counts = new Map<string, number>();
  (equipment ?? []).forEach((e) => {
    if (e.site_id) counts.set(e.site_id, (counts.get(e.site_id) || 0) + 1);
  });

  return (
    <SitesView
      sites={(sites ?? []).map((s) => ({ ...s, equipmentCount: counts.get(s.id) || 0 }))}
      companies={companies ?? []}
      contacts={(contacts ?? []).map((c) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" "),
      }))}
    />
  );
}
