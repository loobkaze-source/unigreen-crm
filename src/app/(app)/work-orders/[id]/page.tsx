import { notFound } from "next/navigation";
import { getSessionContext, rows, fetchAllRes } from "@/lib/data";
import { loadAudit } from "@/lib/audit";
import { ChangeLog } from "@/components/app/change-log";
import { loadConflicts } from "@/lib/schedule-conflicts";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { assetCode } from "@/lib/asset";
import { loadCaseOptions } from "../case-options";
import { loadContractOptions } from "../contract-options";
import { WorkOrderDetail } from "./work-order-detail";
import { loadVisibleWorkOrder } from "./load-work-order";

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, org } = await getSessionContext();

  // Not in this org, or (for a field technician) not assigned to them.
  const { workOrder, fieldOnly } = await loadVisibleWorkOrder(id);
  if (!workOrder) notFound();

  const [
    photosRes,
    partsRes,
    techRes,
    companiesRes,
    contactsRes,
    sitesRes,
    assetsRes,
    woAssetsRes,
    woTechsRes,
    tagsRes,
    codesRes,
    caseList,
    contractList,
  ] = await Promise.all([
    supabase
      .from("work_order_photos")
      .select("*")
      .eq("work_order_id", id)
      // The order the technician arranged them in, then whatever arrived first.
      .order("position")
      .order("created_at"),
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
      supabase
        .from("companies")
        .select("id, name")
        .eq("org_id", org.id)
        .order("name")
        .order("id")
    ),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, company_id, phone")
      .eq("org_id", org.id)
      .order("first_name")
        .limit(500),
    fetchAllRes(() =>
      supabase
        .from("sites")
        .select("id, name, company_id, address, map_url")
        .eq("org_id", org.id)
        .order("name")
        .order("id")
    ),
    fetchAllRes(() =>
      supabase
        .from("equipment")
        .select("id, code, name, asset_type, brand, serial_number, project_number, site_id")
        .eq("org_id", org.id)
        .order("code")
        .order("id")
    ),
    supabase
      .from("work_order_assets")
      .select("equipment_id")
      .eq("work_order_id", id),
    supabase
      .from("work_order_technicians")
      .select("technician_id")
      .eq("work_order_id", id)
      .order("created_at"),
    // What the pickers suggest: the catalogue carried over from the old system,
    // most-used first, and whatever has been typed since. PostgREST caps a
    // response at 1,000 rows regardless of the limit asked for, so ask for
    // what can actually arrive.
    supabase
      .from("service_tags")
      .select("kind, value, uses")
      .eq("org_id", org.id)
      .order("uses", { ascending: false })
      .limit(1000),
    // Only jobs that actually carry codes, newest first — not a whole-table
    // scan whose arbitrary first 1,000 rows change between loads.
    supabase
      .from("work_orders")
      .select("fault_codes, repair_codes, causes")
      .eq("org_id", org.id)
      .or("fault_codes.not.is.null,repair_codes.not.is.null,causes.not.is.null")
      .order("created_at", { ascending: false })
      .limit(500),
    loadCaseOptions(supabase, org.id),
    loadContractOptions(supabase, org.id),
  ]);

  const photos = rows(photosRes);
  const parts = rows(partsRes);
  const technicians = rows(techRes);
  const companies = rows(companiesRes);
  const contacts = rows(contactsRes);
  const sites = rows(sitesRes);
  const assets = rows(assetsRes);
  const woAssets = rows(woAssetsRes);

  const techList = technicians ?? [];
  const assetIds = (woAssets ?? []).map((r) => r.equipment_id as string);
  const crewIds = rows(woTechsRes).map((r) => r.technician_id as string);
  // Flattened and de-duplicated here so the field is handed a vocabulary rather
  // than a thousand jobs to pick through. The catalogue leads, in the order the
  // old system used them; anything typed since follows.
  const used = rows(codesRes);
  const catalogue = rows(tagsRes);
  const vocabulary = (kind: string, key: "fault_codes" | "repair_codes" | "causes") => [
    ...new Set([
      ...catalogue.filter((t) => t.kind === kind).map((t) => t.value as string),
      ...used.flatMap((r) => (r[key] as string[] | null) ?? []),
    ]),
  ].filter(Boolean);
  const faultCodes = vocabulary("fault", "fault_codes");
  const repairCodes = vocabulary("repair", "repair_codes");
  const causeTags = vocabulary("cause", "causes");
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

  const history = await loadAudit(supabase, org.id, { table: "work_orders", rowId: id, limit: 100 });

  return (
    <WorkOrderDetail
      workOrder={workOrder}
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
      contracts={contractList}
      assetIds={assetIds}
      crewIds={crewIds}
      faultCodes={faultCodes}
      repairCodes={repairCodes}
      causeTags={causeTags}
      orgId={org.id}
      clashes={(await loadConflicts(supabase, org.id)).byRecord[id] ?? []}
      canEdit={!fieldOnly}
      backHref={fieldOnly ? "/my-jobs" : "/work-orders"}
      backLabel={fieldOnly ? "กลับไปงานของฉัน" : "กลับไปใบงาน"}
      technicianName={techList.find((t) => t.id === workOrder.technician_id)?.name}
      companyName={companyList.find((c) => c.id === workOrder.company_id)?.name}
      contactName={contactList.find((c) => c.id === workOrder.contact_id)?.name}
      contactPhone={contacts?.find((c) => c.id === workOrder.contact_id)?.phone ?? undefined}
      changeLog={<ChangeLog entries={history} />}
    />
  );
}
