import { notFound } from "next/navigation";
import { getSessionContext, row, rows } from "@/lib/data";
import type { ServiceContract, ServiceVisit } from "@/lib/database.types";
import { ContractDetail } from "./contract-detail";

type Named = { name: string } | null;
type ContractRow = ServiceContract & {
  companies: Named;
  sites: Named;
  technicians: Named;
};
type VisitRow = ServiceVisit & {
  work_orders: {
    id: string;
    number: number | null;
    report_no: string | null;
    status: string;
    scheduled_start: string | null;
    completed_at: string | null;
  } | null;
};

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, org } = await getSessionContext();

  // The three names ride along embedded — resolving them by fetching every
  // company and site in the org was several round trips for three strings.
  const contract = row<ContractRow>(
    await supabase
      .from("service_contracts")
      .select("*, companies(name), sites(name), technicians(name)")
      .eq("id", id)
      .eq("org_id", org.id)
      .maybeSingle()
  );
  if (!contract) notFound();

  // A round is served when its job is finished, so the jobs come embedded too.
  const visits = rows<VisitRow>(
    await supabase
      .from("service_visits")
      .select(
        "*, work_orders(id, number, report_no, status, scheduled_start, completed_at)"
      )
      .eq("contract_id", id)
      .eq("org_id", org.id)
      .order("seq", { ascending: true })
  );

  const workOrders = visits
    .map((v) => v.work_orders)
    .filter((w): w is NonNullable<VisitRow["work_orders"]> => Boolean(w))
    .map((w) => ({
      id: w.id,
      number: w.number ?? null,
      report_no: w.report_no ?? null,
      status: w.status,
      completed_at: w.completed_at ?? null,
    }));

  return (
    <ContractDetail
      contract={contract}
      visits={visits.map((v) => {
        const copy = { ...v, work_orders: undefined };
        delete copy.work_orders;
        return copy;
      })}
      workOrders={workOrders}
      companyName={contract.companies?.name}
      siteName={contract.sites?.name}
      technicianName={contract.technicians?.name}
    />
  );
}
