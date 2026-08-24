import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSessionContext, row, rows } from "@/lib/data";
import { SUPABASE_URL } from "@/lib/supabase/env";
import type { WorkOrder } from "@/lib/database.types";
import { woCode } from "../../constants";
import { PhotoSheets } from "./photo-sheets";

type Params = Promise<{ id: string }>;
type Search = Promise<{ section?: string }>;

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
 * The tab title IS the default filename the browser offers for "Save as PDF",
 * and the whole point of this page is one file per heading — so the title is
 * the heading, and the customer receives "Picture before Work.pdf".
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Search;
}): Promise<Metadata> {
  const { section } = await searchParams;
  return { title: section?.trim() || "รูปหน้างาน" };
}

/**
 * รูปหน้างาน as its own document: one heading, one photograph a page.
 *
 * Separate from the service report on purpose. The report is the record of the
 * job and the photographs are evidence inside it; this is the evidence on its
 * own, at a size worth looking at, in a file named after what it shows.
 */
export default async function WorkOrderPhotosPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { id } = await params;
  const { section = "" } = await searchParams;
  const { supabase } = await getSessionContext();

  const workOrder = await loadWorkOrder(id);
  if (!workOrder) notFound();

  const [companyRes, photoRes] = await Promise.all([
    workOrder.company_id
      ? supabase.from("companies").select("name").eq("id", workOrder.company_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("work_order_photos")
      .select("id, path, caption, section")
      .eq("work_order_id", id)
      .order("position")
      .order("created_at"),
  ]);

  // A heading is matched by name, not by position: the technician may reorder
  // the card between opening this and saving the file.
  const wanted = section.trim();
  const photos = rows(photoRes)
    .filter((p) => ((p.section as string) ?? "").trim() === wanted)
    .map((p) => ({
      id: p.id as string,
      url: `${SUPABASE_URL}/storage/v1/object/public/wo-photos/${p.path}`,
      caption: (p.caption as string) ?? "",
    }));
  if (photos.length === 0) notFound();

  return (
    <PhotoSheets
      photos={photos}
      section={wanted}
      code={woCode(workOrder)}
      customerName={
        ((companyRes.data as { name?: string } | null)?.name as string) ?? "—"
      }
      backHref={`/work-orders/${id}`}
    />
  );
}
