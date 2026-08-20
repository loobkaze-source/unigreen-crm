import { notFound } from "next/navigation";
import { getSessionContext, row, rows, fetchAllRes } from "@/lib/data";
import { isTechnicianOnly } from "@/lib/roles";
import type { WorkOrder } from "@/lib/database.types";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { assetCode } from "@/lib/asset";
import { loadCaseOptions } from "../case-options";
import { WorkOrderDetail } from "./work-order-detail";

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, org, userId, isAdmin, appRoles } = await getSessionContext();

  const workOrder = row<WorkOrder>(
    await supabase
      .from("work_orders")
      .select("*")
      .eq("id", id)
      .eq("org_id", org.id)
      .maybeSingle()
  );

  if (!workOrder) notFound();

  // A pure field technician may only open jobs assigned to them. The nav is
  // already limited to /my-jobs, but this is the check that actually holds —
  // otherwise a guessed URL would expose someone else's job.
  const fieldOnly = !isAdmin && isTechnicianOnly(appRoles);
  if (fieldOnly) {
    const { data: tech } = await supabase
      .from("technicians")
      .select("id")
      .eq("org_id", org.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!tech || workOrder.technician_id !== tech.id) notFound();
  }

  const [
    itemsRes,
    photosRes,
    partsRes,
    techRes,
    companiesRes,
    contactsRes,
    sitesRes,
    assetsRes,
    woAssetsRes,
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
      .from("work_order_parts")
      .select("id, name, qty, equipment_id, unit, unit_price, source")
      .eq("work_order_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("technicians")
      .select("id, name")
      .eq("org_id", org.id)
      .order("name")
        .limit(500),
    fetchAllRes(() =>
      supabase.from("companies").select("id, name").eq("org_id", org.id).order("name")
    ),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, company_id")
      .eq("org_id", org.id)
      .order("first_name")
        .limit(500),
    fetchAllRes(() =>
      supabase
        .from("sites")
        .select("id, name, company_id, address, map_url")
        .eq("org_id", org.id)
        .order("name")
    ),
    fetchAllRes(() =>
      supabase
        .from("equipment")
        .select("id, code, name, asset_type, brand, serial_number, project_number, site_id")
        .eq("org_id", org.id)
        .order("code")
    ),
    supabase
      .from("work_order_assets")
      .select("equipment_id")
      .eq("work_order_id", id),
  ]);

  const items = rows(itemsRes);
  const photos = rows(photosRes);
  const parts = rows(partsRes);
  const technicians = rows(techRes);
  const companies = rows(companiesRes);
  const contacts = rows(contactsRes);
  const sites = rows(sitesRes);
  const assets = rows(assetsRes);
  const woAssets = rows(woAssetsRes);

  const caseList = await loadCaseOptions(supabase, org.id);

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
      signatureUrl={
        workOrder.signature_path
          ? `${SUPABASE_URL}/storage/v1/object/public/wo-photos/${workOrder.signature_path}`
          : null
      }
      parts={parts}
      technicians={techList}
      companies={companyList}
      contacts={contactList}
      sites={sites ?? []}
      assets={assetList}
      cases={caseList}
      assetIds={assetIds}
      orgId={org.id}
      canEdit={!fieldOnly}
      backHref={fieldOnly ? "/my-jobs" : "/work-orders"}
      backLabel={fieldOnly ? "กลับไปงานของฉัน" : "กลับไปใบงาน"}
      technicianName={techList.find((t) => t.id === workOrder.technician_id)?.name}
      companyName={companyList.find((c) => c.id === workOrder.company_id)?.name}
      contactName={contactList.find((c) => c.id === workOrder.contact_id)?.name}
    />
  );
}
