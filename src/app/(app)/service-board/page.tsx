import { getSessionContext, rows } from "@/lib/data";
import { SERVICE_BOARDS } from "@/lib/departments";
import { ServiceBoardView } from "./service-board-view";

const OPEN_STATUSES = ["new", "scheduled", "in_progress", "on_hold"];

export default async function ServiceBoardPage() {
  const { supabase, org, userId, isAdmin } = await getSessionContext();

  // Which service boards may this user see?
  let boardKeys: string[];
  if (isAdmin) {
    boardKeys = SERVICE_BOARDS.map((d) => d.value);
  } else {
    const asg = rows(
      await supabase
        .from("board_assignments")
        .select("board_key")
        .eq("org_id", org.id)
        .eq("board_type", "service")
        .eq("user_id", userId)
    );
    boardKeys = [...new Set(asg.map((a) => a.board_key as string))];
  }

  if (boardKeys.length === 0) {
    return (
      <ServiceBoardView boards={[]} workOrders={[]} contracts={[]} visits={[]} technicians={[]} />
    );
  }

  // One parallel wave: the pending rounds are filtered through their
  // contract's board with an inner join instead of a dependent second query.
  const [woRes, contractsRes, techRes, visitsRes] = await Promise.all([
    supabase
      .from("work_orders")
      .select(
        "id, number, report_no, title, status, board_key, scheduled_start, job_class, billing, technician_id"
      )
      .eq("org_id", org.id)
      .in("board_key", boardKeys)
      .in("status", OPEN_STATUSES)
      .order("scheduled_start", { ascending: true }),
    supabase
      .from("service_contracts")
      .select("id, title, board_key, site_id, status")
      .eq("org_id", org.id)
      .in("board_key", boardKeys)
      .eq("status", "active"),
    supabase.from("technicians").select("id, name, nickname").eq("org_id", org.id),
    supabase
      .from("service_visits")
      .select("id, contract_id, seq, due_date, status, service_contracts!inner(board_key, status)")
      .eq("org_id", org.id)
      .eq("status", "pending")
      .in("service_contracts.board_key", boardKeys)
      .eq("service_contracts.status", "active")
      .order("due_date", { ascending: true }),
  ]);

  type VisitRow = {
    id: string;
    contract_id: string;
    seq: number;
    due_date: string;
    status: string;
    service_contracts: unknown;
  };
  const visits = rows<VisitRow>(visitsRes as never).map((v) => ({
    id: v.id,
    contract_id: v.contract_id,
    seq: v.seq,
    due_date: v.due_date,
    status: v.status,
  }));

  return (
    <ServiceBoardView
      boards={SERVICE_BOARDS.filter((d) => boardKeys.includes(d.value))}
      workOrders={rows(woRes)}
      contracts={rows(contractsRes)}
      visits={visits}
      technicians={rows(techRes)}
    />
  );
}
