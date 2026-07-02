import { getSessionContext } from "@/lib/data";
import { WarrantiesView } from "./warranties-view";

export default async function WarrantiesPage() {
  const { supabase, org } = await getSessionContext();

  const [{ data: warranties }, { data: companies }, { data: sites }] =
    await Promise.all([
      supabase
        .from("warranties")
        .select("*")
        .eq("org_id", org.id)
        .order("end_date", { ascending: true, nullsFirst: false })
        .limit(1000),
      supabase.from("companies").select("id, name").eq("org_id", org.id).order("name"),
      supabase.from("sites").select("id, name").eq("org_id", org.id).order("name"),
    ]);

  return (
    <WarrantiesView
      warranties={warranties ?? []}
      companies={companies ?? []}
      sites={sites ?? []}
    />
  );
}
