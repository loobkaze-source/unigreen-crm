"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import type {
  WorkOrderPriority,
  WorkOrderStatus,
  WorkOrderType,
} from "@/lib/database.types";

export type WorkOrderInput = {
  id?: string;
  title: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  job_class?: string | null;
  billing?: string | null;
  asset_id?: string | null;
  asset_ids?: string[];
  board_key?: string | null;
  site_id?: string | null;
  company_id?: string | null;
  contact_id?: string | null;
  technician_id?: string | null;
  site_address?: string;
  site_map_url?: string;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  description?: string;
};

const oneOf = (v: string | null | undefined, allowed: string[]) =>
  v && allowed.includes(v) ? v : null;

function iso(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Replace a work order's linked assets (M2M). Returns an error message or null. */
async function syncAssets(
  supabase: Awaited<ReturnType<typeof getSessionContext>>["supabase"],
  orgId: string,
  workOrderId: string,
  assetIds: string[]
): Promise<string | null> {
  const unique = [...new Set(assetIds.filter(Boolean))];
  // Insert first so a failure doesn't leave the WO with zero assets.
  if (unique.length) {
    const { error: insErr } = await supabase.from("work_order_assets").upsert(
      unique.map((equipment_id) => ({
        org_id: orgId,
        work_order_id: workOrderId,
        equipment_id,
      })),
      { onConflict: "work_order_id,equipment_id" }
    );
    if (insErr) return insErr.message;
  }
  // Then drop any links no longer selected.
  let del = supabase.from("work_order_assets").delete().eq("work_order_id", workOrderId);
  if (unique.length) del = del.not("equipment_id", "in", `(${unique.join(",")})`);
  const { error: delErr } = await del;
  if (delErr) return delErr.message;
  return null;
}

export async function saveWorkOrder(input: WorkOrderInput): Promise<ActionResult> {
  const { supabase, org, userId } = await getSessionContext();
  const title = input.title?.trim();
  if (!title) return fail("กรุณากรอกชื่องาน");

  const assetIds = input.asset_ids ?? (input.asset_id ? [input.asset_id] : []);

  const payload: Record<string, unknown> = {
    org_id: org.id,
    title,
    type: input.type || "installation",
    status: input.status || "new",
    priority: input.priority || "normal",
    job_class: oneOf(input.job_class, ["CM", "PM"]),
    billing: oneOf(input.billing, ["warranty", "paid"]),
    asset_id: assetIds[0] ?? null, // keep the single column pointing at the first
    board_key: oneOf(input.board_key, ["unigreen", "product_sales", "services_sales"]),
    site_id: input.site_id || null,
    company_id: input.company_id || null,
    contact_id: input.contact_id || null,
    technician_id: input.technician_id || null,
    site_address: input.site_address?.trim() || null,
    site_map_url: input.site_map_url?.trim() || null,
    scheduled_start: iso(input.scheduled_start),
    scheduled_end: iso(input.scheduled_end),
    description: input.description?.trim() || null,
  };
  if (input.status === "completed") payload.completed_at = new Date().toISOString();

  if (input.id) {
    const { error } = await supabase
      .from("work_orders")
      .update(payload)
      .eq("id", input.id);
    if (error) return fail(error.message);
    const aErr = await syncAssets(supabase, org.id, input.id, assetIds);
    if (aErr) return fail(aErr);
    revalidatePath(`/work-orders/${input.id}`);
  } else {
    // New WO is owned by its creator (the Dispatcher).
    payload.owner_id = userId;
    const { data, error } = await supabase
      .from("work_orders")
      .insert(payload)
      .select("id")
      .single();
    if (error) return fail(error.message);
    const aErr = await syncAssets(supabase, org.id, data.id, assetIds);
    if (aErr) return fail(aErr);
    revalidatePath("/work-orders");
    return ok(data.id);
  }

  revalidatePath("/work-orders");
  return ok(input.id);
}

export async function updateWorkOrderStatus(
  id: string,
  status: WorkOrderStatus
): Promise<ActionResult> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase
    .from("work_orders")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  return ok();
}

export async function deleteWorkOrder(id: string): Promise<ActionResult> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.from("work_orders").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/work-orders");
  return ok();
}

// ---- Checklist ------------------------------------------------------------
export async function addChecklistItem(
  workOrderId: string,
  label: string
): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const text = label?.trim();
  if (!text) return fail("กรุณากรอกรายการ");

  const { count } = await supabase
    .from("work_order_items")
    .select("*", { count: "exact", head: true })
    .eq("work_order_id", workOrderId);

  const { error } = await supabase.from("work_order_items").insert({
    org_id: org.id,
    work_order_id: workOrderId,
    label: text,
    position: count ?? 0,
  });
  if (error) return fail(error.message);
  revalidatePath(`/work-orders/${workOrderId}`);
  return ok();
}

export async function toggleChecklistItem(
  id: string,
  done: boolean,
  workOrderId: string
): Promise<ActionResult> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase
    .from("work_order_items")
    .update({ done })
    .eq("id", id);
  if (error) return fail(error.message);
  revalidatePath(`/work-orders/${workOrderId}`);
  return ok();
}

export async function deleteChecklistItem(
  id: string,
  workOrderId: string
): Promise<ActionResult> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.from("work_order_items").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath(`/work-orders/${workOrderId}`);
  return ok();
}

// ---- Photos ---------------------------------------------------------------
export async function addWorkOrderPhoto(
  workOrderId: string,
  path: string,
  caption?: string
): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const { error } = await supabase.from("work_order_photos").insert({
    org_id: org.id,
    work_order_id: workOrderId,
    path,
    caption: caption?.trim() || null,
  });
  if (error) return fail(error.message);
  revalidatePath(`/work-orders/${workOrderId}`);
  return ok();
}

export async function deleteWorkOrderPhoto(
  id: string,
  path: string,
  workOrderId: string
): Promise<ActionResult> {
  const { supabase } = await getSessionContext();
  await supabase.storage.from("wo-photos").remove([path]);
  const { error } = await supabase.from("work_order_photos").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath(`/work-orders/${workOrderId}`);
  return ok();
}
