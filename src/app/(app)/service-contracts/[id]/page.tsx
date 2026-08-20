import { notFound } from "next/navigation";
import { getSessionContext, fetchAllRes } from "@/lib/data";
import { ContractDetail } from "./contract-detail";

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, org } = await getSessionContext();

  const { data: contract } = await supabase
    .from("service_contracts")
    .select("*")
    .eq("id", id)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!contract) notFound();

  const [{ data: visits }, { data: companies }, { data: sites }, { data: technicians }] =
    await Promise.all([
      supabase
        .from("service_visits")
        .select("*")
        .eq("contract_id", id)
        .order("seq", { ascending: true }),
      fetchAllRes(() => supabase.from("companies").select("id, name").eq("org_id", org.id)),
      fetchAllRes(() => supabase.from("sites").select("id, name").eq("org_id", org.id)),
      supabase.from("technicians").select("id, name").eq("org_id", org.id).limit(500),
    ]);

  // A round is served when its job is finished, so the jobs come too.
  const woIds = (visits ?? []).map((v) => v.work_order_id).filter(Boolean) as string[];
  const { data: workOrders } = woIds.length
    ? await supabase
        .from("work_orders")
        .select("id, number, report_no, status, scheduled_start, completed_at")
        .in("id", woIds)
    : { data: [] };

  const find = (arr: { id: string; name: string }[] | null, id: string | null) =>
    id ? arr?.find((x) => x.id === id)?.name : undefined;

  return (
    <ContractDetail
      contract={contract}
      visits={visits ?? []}
      workOrders={(workOrders ?? []).map((w) => ({
        id: w.id as string,
        number: (w.number as number) ?? null,
        report_no: (w.report_no as string) ?? null,
        status: w.status as string,
        completed_at: (w.completed_at as string) ?? null,
      }))}
      companyName={find(companies, contract.company_id)}
      siteName={find(sites, contract.site_id)}
      technicianName={find(technicians, contract.technician_id)}
    />
  );
}
