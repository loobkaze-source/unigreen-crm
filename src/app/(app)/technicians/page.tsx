import { rows } from "@/lib/data";
import { TechniciansView } from "./technicians-view";
import { requireFullAccess } from "@/lib/page-access";

export default async function TechniciansPage() {
  const { supabase, org } = await requireFullAccess();

  const technicians = rows(
    await supabase
      .from("technicians")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false })
      .limit(1000)
  );

  return <TechniciansView technicians={technicians} />;
}
