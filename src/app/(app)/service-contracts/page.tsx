import { getSessionContext } from "@/lib/data";
import { ContractsView } from "./contracts-view";

export default async function ServiceContractsPage() {
  const { supabase, org } = await getSessionContext();

  const [
    { data: contracts },
    { data: visits },
    { data: companies },
    { data: sites },
    { data: technicians },
  ] = await Promise.all([
    supabase
      .from("service_contracts")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("service_visits")
      .select("contract_id, status, due_date")
      .eq("org_id", org.id),
    supabase.from("companies").select("id, name").eq("org_id", org.id).order("name"),
    supabase.from("sites").select("id, name").eq("org_id", org.id).order("name"),
    supabase
      .from("technicians")
      .select("id, name")
      .eq("org_id", org.id)
      .eq("active", true)
      .order("name"),
  ]);

  const stats = new Map<
    string,
    { total: number; done: number; nextDue: string | null }
  >();
  (visits ?? []).forEach((v) => {
    const s = stats.get(v.contract_id) ?? { total: 0, done: 0, nextDue: null };
    s.total += 1;
    if (v.status === "done") s.done += 1;
    if (v.status === "pending") {
      if (!s.nextDue || v.due_date < s.nextDue) s.nextDue = v.due_date;
    }
    stats.set(v.contract_id, s);
  });

  return (
    <ContractsView
      contracts={(contracts ?? []).map((c) => ({
        ...c,
        ...(stats.get(c.id) ?? { total: 0, done: 0, nextDue: null }),
      }))}
      companies={companies ?? []}
      sites={sites ?? []}
      technicians={technicians ?? []}
    />
  );
}
