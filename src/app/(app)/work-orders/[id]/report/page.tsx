import { notFound } from "next/navigation";
import { getSessionContext, row, rows } from "@/lib/data";
import { SUPABASE_URL } from "@/lib/supabase/env";
import type { WorkOrder } from "@/lib/database.types";
import { COMPANY } from "@/lib/company";
import { ServiceReport } from "./service-report";

/**
 * รายงานการซ่อม / SERVICE REPORT — the job on one sheet of A4, laid out as the
 * printed book the technicians have always used, so a customer signing it
 * recognises what they are signing.
 */
export default async function ServiceReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, org } = await getSessionContext();

  const workOrder = row<WorkOrder>(
    (await supabase
      .from("work_orders")
      .select("*")
      .eq("id", id)
      .eq("org_id", org.id)
      .maybeSingle()) as never
  );
  if (!workOrder) notFound();

  const [companyRes, siteRes, contactRes, techRes, linkRes, crewRes, photoRes, partsRes] =
    await Promise.all([
    workOrder.company_id
      ? supabase.from("companies").select("name, address").eq("id", workOrder.company_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    workOrder.site_id
      ? supabase.from("sites").select("name, address").eq("id", workOrder.site_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    workOrder.contact_id
      ? supabase
          .from("contacts")
          .select("first_name, last_name, phone")
          .eq("id", workOrder.contact_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    workOrder.technician_id
      ? supabase
          .from("technicians")
          .select("name, nickname")
          .eq("id", workOrder.technician_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("work_order_assets").select("equipment_id").eq("work_order_id", id),
    // Everyone who was there, and everything they photographed.
    supabase
      .from("work_order_technicians")
      .select("technician_id")
      .eq("work_order_id", id)
      .order("created_at"),
    supabase
      .from("work_order_photos")
      .select("id, path, caption")
      .eq("work_order_id", id)
      .order("created_at"),
    supabase
      .from("work_order_parts")
      .select("id, name, qty, unit, unit_price, source")
      .eq("work_order_id", id)
      .order("created_at"),
    ]);

  const equipmentIds = rows(linkRes).map((r) => r.equipment_id as string);
  const assetsRes = equipmentIds.length
    ? await supabase
        .from("equipment")
        .select("id, name, brand, model, serial_number, project_number")
        .in("id", equipmentIds)
    : { data: [], error: null };

  const parts = rows(partsRes).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    qty: Number(p.qty),
    unit: (p.unit as string) || "",
    unitPrice: p.unit_price == null ? null : Number(p.unit_price),
    source: (p.source as string) ?? "material",
  }));

  const crewIds = rows(crewRes).map((r) => r.technician_id as string);
  const crewRows = crewIds.length
    ? await supabase.from("technicians").select("id, name, nickname").in("id", crewIds)
    : { data: [], error: null };
  // In the order they were added, which is the order the report lists them.
  const crew = crewIds
    .map((cid) => rows(crewRows).find((t) => t.id === cid))
    .filter(Boolean)
    .map((t) => ((t!.name as string) || (t!.nickname as string)) ?? "");

  const contact = contactRes.data;
  return (
    <ServiceReport
      company={COMPANY}
      workOrder={workOrder}
      customerName={(companyRes.data?.name as string) ?? ""}
      location={[siteRes.data?.name, workOrder.site_address || siteRes.data?.address]
        .filter(Boolean)
        .join("\n")}
      contactName={
        contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : ""
      }
      technicianName={
        (techRes.data?.name as string) || (techRes.data?.nickname as string) || ""
      }
      assets={rows(assetsRes).map((a) => ({
        name: a.name as string,
        model: [a.brand, a.model].filter(Boolean).join(" ") as string,
        serial: ((a.serial_number as string) || (a.project_number as string) || "") as string,
      }))}
      parts={parts}
      crew={crew}
      photos={rows(photoRes).map((p) => ({
        id: p.id as string,
        url: `${SUPABASE_URL}/storage/v1/object/public/wo-photos/${p.path}`,
        caption: (p.caption as string) ?? "",
      }))}
      signatureUrl={
        workOrder.signature_path
          ? `${SUPABASE_URL}/storage/v1/object/public/wo-photos/${workOrder.signature_path}`
          : null
      }
    />
  );
}
