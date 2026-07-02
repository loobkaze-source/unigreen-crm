import { getSessionContext, rows } from "@/lib/data";
import { ContractsView } from "./contracts-view";

export default async function ServiceContractsPage() {
  const { supabase, org } = await getSessionContext();

  const [contractsRes, visitStatsRes, companiesRes, sitesRes, techRes] =
    await Promise.all([
    supabase
      .from("service_contracts")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false })
      .limit(1000),
    // Aggregated per contract in SQL (view, migration 0022) instead of
    // pulling every visit row org-wide.
    supabase
      .from("contract_visit_stats")
      .select("contract_id, total, done, next_due")
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

  const contracts = rows(contractsRes);
  const companies = rows(companiesRes);
  const sites = rows(sitesRes);
  const technicians = rows(techRes);

  const stats = new Map<
    string,
    { total: number; done: number; nextDue: string | null }
  >(
    rows(visitStatsRes).map((v) => [
      v.contract_id as string,
      { total: v.total ?? 0, done: v.done ?? 0, nextDue: v.next_due ?? null },
    ])
  );

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
