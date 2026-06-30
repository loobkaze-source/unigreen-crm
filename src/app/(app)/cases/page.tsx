import { getSessionContext } from "@/lib/data";
import { CasesView } from "./cases-view";

export default async function CasesPage() {
  const { supabase, org } = await getSessionContext();

  const [{ data: cases }, { data: companies }, { data: contacts }] =
    await Promise.all([
      supabase
        .from("cases")
        .select("*")
        .eq("org_id", org.id)
        .order("case_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),
      supabase.from("companies").select("id, name").eq("org_id", org.id).order("name"),
      supabase
        .from("contacts")
        .select("id, first_name, last_name")
        .eq("org_id", org.id)
        .order("first_name"),
    ]);

  return (
    <CasesView
      cases={cases ?? []}
      companies={companies ?? []}
      contacts={(contacts ?? []).map((c) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" "),
      }))}
    />
  );
}
