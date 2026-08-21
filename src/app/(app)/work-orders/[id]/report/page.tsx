import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSessionContext, row, rows } from "@/lib/data";
import { SUPABASE_URL } from "@/lib/supabase/env";
import type { WorkOrder } from "@/lib/database.types";
import { COMPANY } from "@/lib/company";
import { woCode } from "../../constants";
import { ServiceReport } from "./service-report";

/** One fetch per request, shared by generateMetadata and the page. */
const loadWorkOrder = cache(async (id: string) => {
  const { supabase, org } = await getSessionContext();
  return row<WorkOrder>(
    (await supabase
      .from("work_orders")
      .select("*")
      .eq("id", id)
      .eq("org_id", org.id)
      .maybeSingle()) as never
  );
});

/**
 * The tab title IS the default filename the browser offers for "Save as PDF" —
 * so it carries the service report code (MRD-0826-00001-01), not the app name.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const workOrder = await loadWorkOrder(id);
  return { title: workOrder ? woCode(workOrder) : "Service Report" };
}

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
  const { supabase } = await getSessionContext();

  const workOrder = await loadWorkOrder(id);
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
    supabase
      .from("work_order_assets")
      .select("equipment(id, name, brand, model, serial_number, project_number)")
      .eq("work_order_id", id),
    // Everyone who was there (names embedded), and everything they photographed.
    supabase
      .from("work_order_technicians")
      .select("technician_id, technicians(name, nickname)")
      .eq("work_order_id", id)
      .order("created_at"),
    supabase
      .from("work_order_photos")
      .select("id, path, caption, section")
      .eq("work_order_id", id)
      .order("position")
      .order("created_at"),
    supabase
      .from("work_order_parts")
      .select("id, name, qty, unit, unit_price, source")
      .eq("work_order_id", id)
      .order("created_at"),
    ]);

  type AssetEmbed = {
    equipment: {
      id: string;
      name: string;
      brand: string | null;
      model: string | null;
      serial_number: string | null;
      project_number: string | null;
    } | null;
  };
  const linkedAssets = rows<AssetEmbed>(linkRes as never)
    .map((r) => r.equipment)
    .filter((e): e is NonNullable<AssetEmbed["equipment"]> => Boolean(e));

  const parts = rows(partsRes).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    qty: Number(p.qty),
    unit: (p.unit as string) || "",
    unitPrice: p.unit_price == null ? null : Number(p.unit_price),
    source: (p.source as string) ?? "material",
  }));

  // In the order they were added, which is the order the report lists them.
  type CrewEmbed = {
    technician_id: string;
    technicians: { name: string | null; nickname: string | null } | null;
  };
  const crew = rows<CrewEmbed>(crewRes as never)
    .map((r) => r.technicians)
    .filter(Boolean)
    .map((t) => (t!.name || t!.nickname) ?? "");

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
      assets={linkedAssets.map((a) => ({
        name: a.name,
        model: [a.brand, a.model].filter(Boolean).join(" "),
        serial: a.serial_number || a.project_number || "",
      }))}
      parts={parts}
      crew={crew}
      photos={rows(photoRes).map((p) => ({
        id: p.id as string,
        url: `${SUPABASE_URL}/storage/v1/object/public/wo-photos/${p.path}`,
        caption: (p.caption as string) ?? "",
        section: (p.section as string) ?? "",
      }))}
      signatureUrl={
        workOrder.signature_path
          ? `${SUPABASE_URL}/storage/v1/object/public/wo-photos/${workOrder.signature_path}`
          : null
      }
    />
  );
}
