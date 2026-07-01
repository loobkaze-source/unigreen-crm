import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/data";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { WorkOrderDetail } from "./work-order-detail";

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, org } = await getSessionContext();

  const { data: workOrder } = await supabase
    .from("work_orders")
    .select("*")
    .eq("id", id)
    .eq("org_id", org.id)
    .maybeSingle();

  if (!workOrder) notFound();

  const [
    { data: items },
    { data: photos },
    { data: technicians },
    { data: companies },
    { data: contacts },
    { data: assets },
  ] = await Promise.all([
    supabase
      .from("work_order_items")
      .select("*")
      .eq("work_order_id", id)
      .order("position", { ascending: true }),
    supabase
      .from("work_order_photos")
      .select("*")
      .eq("work_order_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("technicians")
      .select("id, name")
      .eq("org_id", org.id)
      .order("name"),
    supabase.from("companies").select("id, name").eq("org_id", org.id).order("name"),
    supabase
      .from("contacts")
      .select("id, first_name, last_name")
      .eq("org_id", org.id)
      .order("first_name"),
    supabase
      .from("equipment")
      .select("id, name, asset_type, serial_number, project_number")
      .eq("org_id", org.id)
      .order("name"),
  ]);

  const techList = technicians ?? [];
  const assetList = (assets ?? []).map((a) => {
    const code = a.asset_type === "project" ? a.project_number : a.serial_number;
    return { id: a.id, name: code ? `${a.name} · ${code}` : a.name };
  });
  const companyList = companies ?? [];
  const contactList = (contacts ?? []).map((c) => ({
    id: c.id,
    name: [c.first_name, c.last_name].filter(Boolean).join(" "),
  }));

  const photosWithUrl = (photos ?? []).map((p) => ({
    ...p,
    url: `${SUPABASE_URL}/storage/v1/object/public/wo-photos/${p.path}`,
  }));

  return (
    <WorkOrderDetail
      workOrder={workOrder}
      items={items ?? []}
      photos={photosWithUrl}
      technicians={techList}
      companies={companyList}
      contacts={contactList}
      assets={assetList}
      orgId={org.id}
      technicianName={techList.find((t) => t.id === workOrder.technician_id)?.name}
      companyName={companyList.find((c) => c.id === workOrder.company_id)?.name}
      contactName={contactList.find((c) => c.id === workOrder.contact_id)?.name}
    />
  );
}
