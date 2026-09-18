import { notFound } from "next/navigation";
import { getSessionContext, row, rows, fetchAllRes } from "@/lib/data";
import { loadAudit } from "@/lib/audit";
import { ChangeLog } from "@/components/app/change-log";
import type { ServiceContract, ServiceVisit } from "@/lib/database.types";
import { ContractDetail, type ScheduleSnapshot } from "./contract-detail";

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

  // How the plan got to be what it is, newest first — and who did it, as a
  // name rather than a uuid.
  const { data: log } = await supabase
    .from("service_schedule_log")
    .select("id, changed_at, changed_by, action, before, after, note")
    .eq("contract_id", id)
    .eq("org_id", org.id)
    .order("changed_at", { ascending: false })
    .limit(100);
  const changerIds = [
    ...new Set((log ?? []).map((l) => l.changed_by as string | null).filter(Boolean)),
  ] as string[];
  const { data: changers } = changerIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", changerIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const changerName = new Map(
    (changers ?? []).map((c) => [c.id as string, (c.full_name as string | null) ?? "—"])
  );

  // What the edit form offers to pick from. Fetched here rather than kept
  // on the client, because the form is one click away on this page too.
  const [companiesRes, sitesRes, techRes] = await Promise.all([
    fetchAllRes(() =>
      supabase.from("companies").select("id, name").eq("org_id", org.id).order("name").order("id")
    ),
    fetchAllRes(() =>
      supabase.from("sites").select("id, name, company_id").eq("org_id", org.id).order("name").order("id")
    ),
    supabase.from("technicians").select("id, name").eq("org_id", org.id).eq("active", true).order("name").limit(500),
  ]);

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

  const history = await loadAudit(supabase, org.id, { table: "service_contracts", rowId: id, limit: 100 });

  return (
    <ContractDetail
      contract={contract}
      visits={visits.map((v) => {
        const copy = { ...v, work_orders: undefined };
        delete copy.work_orders;
        return copy;
      })}
      workOrders={workOrders}
      companies={rows(companiesRes) ?? []}
      sites={rows(sitesRes) ?? []}
      technicians={rows(techRes) ?? []}
      log={(log ?? []).map((l) => ({
        id: l.id as string,
        changed_at: l.changed_at as string,
        by: l.changed_by ? changerName.get(l.changed_by as string) ?? "—" : "ระบบ",
        action: l.action as "planned" | "rescheduled" | "moved",
        before: (l.before as ScheduleSnapshot | null) ?? null,
        after: l.after as ScheduleSnapshot,
        note: (l.note as string | null) ?? null,
      }))}
      companyName={contract.companies?.name}
      siteName={contract.sites?.name}
      technicianName={contract.technicians?.name}
      changeLog={<ChangeLog entries={history} />}
    />
  );
}
