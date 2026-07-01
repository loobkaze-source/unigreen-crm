import { getSessionContext } from "@/lib/data";
import { DEPARTMENTS } from "@/lib/departments";
import { ServiceBoardView } from "./service-board-view";

const OPEN_STATUSES = ["new", "scheduled", "in_progress", "on_hold"];

export default async function ServiceBoardPage() {
  const { supabase, org, userId, isAdmin } = await getSessionContext();

  // Which service boards may this user see?
  let boardKeys: string[];
  if (isAdmin) {
    boardKeys = DEPARTMENTS.map((d) => d.value);
  } else {
    const { data: asg } = await supabase
      .from("board_assignments")
      .select("board_key")
      .eq("org_id", org.id)
      .eq("board_type", "service")
      .eq("user_id", userId);
    boardKeys = [...new Set((asg ?? []).map((a) => a.board_key as string))];
  }

  if (boardKeys.length === 0) {
    return (
      <ServiceBoardView boards={[]} workOrders={[]} contracts={[]} visits={[]} technicians={[]} />
    );
  }

  const [{ data: workOrders }, { data: contracts }, { data: technicians }] =
    await Promise.all([
      supabase
        .from("work_orders")
        .select(
          "id, number, title, status, board_key, scheduled_start, job_class, billing, technician_id"
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
    ]);

  const contractIds = (contracts ?? []).map((c) => c.id);
  const { data: visits } = contractIds.length
    ? await supabase
        .from("service_visits")
        .select("id, contract_id, seq, due_date, status")
        .eq("org_id", org.id)
        .in("contract_id", contractIds)
        .eq("status", "pending")
        .order("due_date", { ascending: true })
    : { data: [] };

  return (
    <ServiceBoardView
      boards={DEPARTMENTS.filter((d) => boardKeys.includes(d.value))}
      workOrders={workOrders ?? []}
      contracts={contracts ?? []}
      visits={visits ?? []}
      technicians={technicians ?? []}
    />
  );
}
