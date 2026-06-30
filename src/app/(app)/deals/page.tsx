import { getSessionContext } from "@/lib/data";
import { DealsBoard } from "./deals-board";

export default async function DealsPage() {
  const { supabase, org } = await getSessionContext();

  const [{ data: stages }, { data: deals }, { data: companies }, { data: contacts }] =
    await Promise.all([
      supabase
        .from("stages")
        .select("*")
        .eq("org_id", org.id)
        .order("position", { ascending: true }),
      supabase
        .from("deals")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false }),
      supabase.from("companies").select("id, name").eq("org_id", org.id).order("name"),
      supabase
        .from("contacts")
        .select("id, first_name, last_name")
        .eq("org_id", org.id)
        .order("first_name"),
    ]);

  return (
    <DealsBoard
      stages={stages ?? []}
      deals={deals ?? []}
      companies={companies ?? []}
      contacts={(contacts ?? []).map((c) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" "),
      }))}
    />
  );
}
