import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/data";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { assetCode } from "@/lib/asset";
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
    { data: sites },
    { data: assets },
    { data: cases },
    { data: woAssets },
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
      .select("id, first_name, last_name, company_id")
      .eq("org_id", org.id)
      .order("first_name"),
    supabase
      .from("sites")
      .select("id, name, company_id, address, map_url")
      .eq("org_id", org.id)
      .order("name"),
    supabase
      .from("equipment")
      .select("id, code, name, asset_type, brand, serial_number, project_number, site_id")
      .eq("org_id", org.id)
      .order("code"),
    supabase
      .from("cases")
      .select("id, number, subject, company_id")
      .eq("org_id", org.id)
      .order("number", { ascending: false }),
    supabase
      .from("work_order_assets")
      .select("equipment_id")
      .eq("work_order_id", id),
  ]);

  const caseList = (cases ?? []).map((c) => ({
    id: c.id,
    company_id: c.company_id,
    name: `${c.number ? `CASE-${String(c.number).padStart(4, "0")}` : "เคส"} · ${c.subject}`,
  }));

  const techList = technicians ?? [];
  const assetIds = (woAssets ?? []).map((r) => r.equipment_id as string);
  const assetList = (assets ?? []).map((a) => {
    const ident = a.asset_type === "project" ? a.project_number : a.serial_number;
    const brand = a.asset_type === "object" && a.brand ? ` (${a.brand})` : "";
    return {
      id: a.id,
      site_id: a.site_id,
      name: `${assetCode(a.code)} · ${a.name}${ident ? ` · ${ident}` : ""}${brand}`,
    };
  });
  const companyList = companies ?? [];
  const contactList = (contacts ?? []).map((c) => ({
    id: c.id,
    name: [c.first_name, c.last_name].filter(Boolean).join(" "),
    company_id: c.company_id,
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
      sites={sites ?? []}
      assets={assetList}
      cases={caseList}
      assetIds={assetIds}
      orgId={org.id}
      technicianName={techList.find((t) => t.id === workOrder.technician_id)?.name}
      companyName={companyList.find((c) => c.id === workOrder.company_id)?.name}
      contactName={contactList.find((c) => c.id === workOrder.contact_id)?.name}
    />
  );
}
