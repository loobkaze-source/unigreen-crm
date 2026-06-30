import { getSessionContext } from "@/lib/data";
import { WorkOrdersView } from "./work-orders-view";

export default async function WorkOrdersPage() {
  const { supabase, org } = await getSessionContext();

  const [
    { data: workOrders },
    { data: technicians },
    { data: companies },
    { data: contacts },
  ] = await Promise.all([
    supabase
      .from("work_orders")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("technicians")
      .select("id, name")
      .eq("org_id", org.id)
      .eq("active", true)
      .order("name"),
    supabase.from("companies").select("id, name").eq("org_id", org.id).order("name"),
    supabase
      .from("contacts")
      .select("id, first_name, last_name")
      .eq("org_id", org.id)
      .order("first_name"),
  ]);

  return (
    <WorkOrdersView
      workOrders={workOrders ?? []}
      technicians={technicians ?? []}
      companies={companies ?? []}
      contacts={(contacts ?? []).map((c) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" "),
      }))}
    />
  );
}
