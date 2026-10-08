import { notFound } from "next/navigation";
import { getSessionContext, row, rows } from "@/lib/data";
import { loadAudit } from "@/lib/audit";
import { ChangeLog } from "@/components/app/change-log";
import { loadConflicts } from "@/lib/schedule-conflicts";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { ASSET_LABEL_COLUMNS, assetLabel } from "@/lib/asset";
import { WorkOrderDetail } from "./work-order-detail";
import { loadVisibleWorkOrder } from "./load-work-order";

/** A to-one embed comes back as an object; the generated types say array. */
const one = <T,>(v: T | T[] | null | undefined): T | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;

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

  // Only what this one job shows. The edit form's pickers (every company,
  // site, contact, case, contract and asset) are fetched when it opens — this
  // page is a technician's, on a phone, and they never open it.
  const [
    photosRes,
    partsRes,
    techRes,
    companyRes,
    contactRes,
    caseRes,
    contractRes,
    woAssetsRes,
    woTechsRes,
    tagsRes,
    codesRes,
    history,
    conflicts,
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
    workOrder.company_id
      ? supabase.from("companies").select("name").eq("id", workOrder.company_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    workOrder.contact_id
      ? supabase
          .from("contacts")
          .select("first_name, last_name, phone")
          .eq("id", workOrder.contact_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    workOrder.case_id
      ? supabase
          .from("cases")
          .select("code, number, subject")
          .eq("id", workOrder.case_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    workOrder.contract_id
      ? supabase
          .from("service_contracts")
          .select("contract_no, title, sites(name)")
          .eq("id", workOrder.contract_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // This job's assets, named the way the picker names them.
    supabase
      .from("work_order_assets")
      .select(`equipment_id, equipment(id, site_id, ${ASSET_LABEL_COLUMNS})`)
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
    // Independent of everything above — in the same wave, not after it.
    loadAudit(supabase, org.id, { table: "work_orders", rowId: id, limit: 100 }),
    loadConflicts(supabase, org.id),
  ]);

  const photos = rows(photosRes);
  const parts = rows(partsRes);
  const techList = rows(techRes);
  const company = row<{ name: string }>(companyRes);
  const contact = row<{ first_name: string; last_name: string | null; phone: string | null }>(
    contactRes
  );
  const caseRow = row<{ code: string | null; number: number | null; subject: string }>(caseRes);
  const contractRow = row<{ contract_no: string | null; title: string; sites: unknown }>(
    contractRes
  );

  type LinkedAsset = Parameters<typeof assetLabel>[0] & { id: string; site_id: string | null };
  const woAssets = rows(woAssetsRes) as { equipment_id: string; equipment: unknown }[];
  const assetIds = woAssets.map((r) => r.equipment_id);
  const linkedAssets = woAssets
    .map((r) => one(r.equipment as LinkedAsset | LinkedAsset[] | null))
    .filter((a): a is LinkedAsset => a != null)
    .sort((a, b) => (a.code ?? 0) - (b.code ?? 0))
    .map((a) => ({ id: a.id, site_id: a.site_id, name: assetLabel(a) }));

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

  const photosWithUrl = photos.map((p) => ({
    ...p,
    url: `${SUPABASE_URL}/storage/v1/object/public/wo-photos/${p.path}`,
  }));

  // Named exactly as the form's pickers name them (case-options.ts /
  // contract-options.ts), so the page and the form agree.
  const caseName = caseRow
    ? `${caseRow.code ?? (caseRow.number ? `CASE-${String(caseRow.number).padStart(4, "0")}` : "เคส")} · ${caseRow.subject}`
    : undefined;
  const contractName = contractRow
    ? [
        contractRow.contract_no,
        contractRow.title,
        one(contractRow.sites as { name: string } | { name: string }[] | null)?.name,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

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
      assets={linkedAssets}
      contractName={contractName}
      caseName={caseName}
      assetIds={assetIds}
      crewIds={crewIds}
      faultCodes={faultCodes}
      repairCodes={repairCodes}
      causeTags={causeTags}
      orgId={org.id}
      clashes={conflicts.byRecord[id] ?? []}
      canEdit={!fieldOnly}
      backHref={fieldOnly ? "/my-jobs" : "/work-orders"}
      backLabel={fieldOnly ? "กลับไปงานของฉัน" : "กลับไปใบงาน"}
      technicianName={techList.find((t) => t.id === workOrder.technician_id)?.name}
      companyName={company?.name}
      contactName={
        contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : undefined
      }
      contactPhone={contact?.phone ?? undefined}
      changeLog={<ChangeLog entries={history} />}
    />
  );
}
