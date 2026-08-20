"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import { isTechnicianOnly } from "@/lib/roles";
import { DEFAULT_WO_TYPE } from "./constants";
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
  case_id?: string | null;
  contract_id?: string | null;
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

/** A field-only technician works jobs; they don't create, edit or delete them. */
const NO_EDIT = "ช่างไม่มีสิทธิ์สร้าง แก้ไข หรือลบใบสั่งงาน";

export async function saveWorkOrder(input: WorkOrderInput): Promise<ActionResult> {
  const ctx = await getSessionContext();
  const { supabase, org, userId } = ctx;
  if (!ctx.isAdmin && isTechnicianOnly(ctx.appRoles)) return fail(NO_EDIT);
  const title = input.title?.trim();
  if (!title) return fail("กรุณากรอกชื่องาน");

  const assetIds = input.asset_ids ?? (input.asset_id ? [input.asset_id] : []);

  const startIso = iso(input.scheduled_start);
  let endIso = iso(input.scheduled_end);
  // Guard against an inverted range slipping through.
  if (startIso && endIso && endIso < startIso) endIso = null;

  const payload: Record<string, unknown> = {
    org_id: org.id,
    title,
    type: input.type || DEFAULT_WO_TYPE,
    status: input.status || "new",
    priority: input.priority || "normal",
    job_class: oneOf(input.job_class, ["CM", "PM"]),
    billing: oneOf(input.billing, ["warranty", "paid"]),
    asset_id: assetIds[0] ?? null, // keep the single column pointing at the first
    board_key: oneOf(input.board_key, ["unigreen", "product_sales", "services_sales"]),
    site_id: input.site_id || null,
    case_id: input.case_id || null,
    contract_id: input.contract_id || null,
    company_id: input.company_id || null,
    contact_id: input.contact_id || null,
    technician_id: input.technician_id || null,
    site_address: input.site_address?.trim() || null,
    site_map_url: input.site_map_url?.trim() || null,
    scheduled_start: startIso,
    scheduled_end: endIso,
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
    if (input.status === "completed") {
      await restoreAssetsOnComplete(supabase, org.id, input.id);
    }
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

/**
 * When a work order completes, machines it covered that were reported
 * degraded/down go back to operational (retired assets are left alone).
 */
async function restoreAssetsOnComplete(
  supabase: Awaited<ReturnType<typeof getSessionContext>>["supabase"],
  orgId: string,
  workOrderId: string
) {
  const [{ data: wo }, { data: links }] = await Promise.all([
    supabase.from("work_orders").select("asset_id").eq("id", workOrderId).maybeSingle(),
    supabase
      .from("work_order_assets")
      .select("equipment_id")
      .eq("work_order_id", workOrderId),
  ]);
  const ids = new Set<string>();
  if (wo?.asset_id) ids.add(wo.asset_id as string);
  (links ?? []).forEach((l) => ids.add(l.equipment_id as string));
  if (ids.size === 0) return;
  await supabase
    .from("equipment")
    .update({ status: "operational" })
    .in("id", [...ids])
    .eq("org_id", orgId)
    .in("status", ["degraded", "down"]);
  revalidatePath("/assets");
}

/**
 * The technician record for the signed-in user, or null. A member is "field
 * only" when Technician is their sole role — those users may act on the jobs
 * assigned to them and nothing else.
 */
async function myTechnicianId(
  ctx: Awaited<ReturnType<typeof getSessionContext>>
): Promise<string | null> {
  const { data } = await ctx.supabase
    .from("technicians")
    .select("id")
    .eq("org_id", ctx.org.id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

const NOT_YOURS = "ใบสั่งงานนี้ไม่ได้มอบหมายให้คุณ";

/** Guard: a field-only technician may only touch their own work order. */
async function assertMayWork(
  ctx: Awaited<ReturnType<typeof getSessionContext>>,
  workOrderId: string
): Promise<string | null> {
  if (ctx.isAdmin || !isTechnicianOnly(ctx.appRoles)) return null;
  const techId = await myTechnicianId(ctx);
  if (!techId) return NOT_YOURS;
  const { data } = await ctx.supabase
    .from("work_orders")
    .select("technician_id")
    .eq("id", workOrderId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  return data && data.technician_id === techId ? null : NOT_YOURS;
}

/** The assigned technician acknowledges the job ("กดรับงาน"). */
export async function acceptWorkOrder(id: string): Promise<ActionResult> {
  const ctx = await getSessionContext();
  const { supabase, org, userId } = ctx;

  const techId = await myTechnicianId(ctx);
  const { data: wo } = await supabase
    .from("work_orders")
    .select("technician_id, accepted_at")
    .eq("id", id)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!wo) return fail("ไม่พบใบสั่งงาน");
  // Only the technician it was assigned to can accept it — not an admin on
  // their behalf, otherwise the timestamp would not mean anything.
  if (!techId || wo.technician_id !== techId) return fail(NOT_YOURS);
  if (wo.accepted_at) return ok(id); // already accepted, nothing to do

  const { error } = await supabase
    .from("work_orders")
    .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
    .eq("id", id)
    .eq("org_id", org.id);
  if (error) return fail(error.message);
  revalidatePath("/my-jobs");
  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  return ok(id);
}

export async function updateWorkOrderStatus(
  id: string,
  status: WorkOrderStatus
): Promise<ActionResult> {
  const ctx = await getSessionContext();
  const { supabase, org } = ctx;

  const denied = await assertMayWork(ctx, id);
  if (denied) return fail(denied);

  const { error } = await supabase
    .from("work_orders")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("org_id", org.id);
  if (error) return fail(error.message);
  if (status === "completed") await restoreAssetsOnComplete(supabase, org.id, id);
  revalidatePath("/my-jobs");
  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  return ok();
}

export async function deleteWorkOrder(id: string): Promise<ActionResult> {
  const ctx = await getSessionContext();
  if (!ctx.isAdmin && isTechnicianOnly(ctx.appRoles)) return fail(NO_EDIT);
  const { error } = await ctx.supabase
    .from("work_orders")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.org.id);
  if (error) return fail(error.message);
  revalidatePath("/work-orders");
  revalidatePath("/my-jobs");
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

  const { data: last } = await supabase
    .from("work_order_items")
    .select("position")
    .eq("work_order_id", workOrderId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("work_order_items").insert({
    org_id: org.id,
    work_order_id: workOrderId,
    label: text,
    position: (last?.position ?? -1) + 1,
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

// ---- Parts replaced ---------------------------------------------------------
export async function addWorkOrderPart(
  workOrderId: string,
  name: string,
  qty: number,
  equipmentId?: string | null,
  unit?: string | null,
  unitPrice?: number | null,
  source: "material" | "store" | "labor" = "material"
): Promise<ActionResult> {
  const ctx = await getSessionContext();
  const denied = await assertMayWork(ctx, workOrderId);
  if (denied) return fail(denied);

  const label = name?.trim();
  if (!label) return fail("กรุณากรอกชื่ออะไหล่");
  const price = Number(unitPrice);
  const { error } = await ctx.supabase.from("work_order_parts").insert({
    org_id: ctx.org.id,
    work_order_id: workOrderId,
    equipment_id: equipmentId || null,
    name: label,
    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    unit: unit?.trim() || null,
    unit_price: Number.isFinite(price) && price >= 0 ? price : null,
    source: source === "store" || source === "labor" ? source : "material",
  });
  if (error) return fail(error.message);
  revalidatePath(`/work-orders/${workOrderId}`);
  return ok();
}

/** The technician's note from site. Editable by whoever may work the job. */
export async function saveTechnicianRemark(
  workOrderId: string,
  remark: string
): Promise<ActionResult> {
  const ctx = await getSessionContext();
  const denied = await assertMayWork(ctx, workOrderId);
  if (denied) return fail(denied);

  const { error } = await ctx.supabase
    .from("work_orders")
    .update({ technician_remark: remark.trim() || null })
    .eq("id", workOrderId)
    .eq("org_id", ctx.org.id);
  if (error) return fail(error.message);
  revalidatePath(`/work-orders/${workOrderId}`);
  return ok();
}

/**
 * How the job was closed: the two codes and the two explanations, plus everyone
 * who stood on site.
 *
 * The codes are the point of the card — a year of them says which fault keeps
 * coming back and which fix holds — so they are kept as their own columns
 * rather than as sentences in a note nothing can count.
 */
export async function saveWorkOrderDiagnosis(
  workOrderId: string,
  patch: {
    fault_code?: string;
    repair_code?: string;
    cause?: string;
    remedy?: string;
    technician_ids?: string[];
  }
): Promise<ActionResult> {
  const ctx = await getSessionContext();
  const denied = await assertMayWork(ctx, workOrderId);
  if (denied) return fail(denied);

  const text = (v: string | undefined) => (v?.trim() ? v.trim() : null);
  const update: Record<string, unknown> = {};
  for (const k of ["fault_code", "repair_code", "cause", "remedy"] as const) {
    if (k in patch) update[k] = text(patch[k]);
  }
  if (Object.keys(update).length) {
    const { error } = await ctx.supabase
      .from("work_orders")
      .update(update)
      .eq("id", workOrderId)
      .eq("org_id", ctx.org.id);
    if (error) return fail(error.message);
  }

  if (patch.technician_ids) {
    const keep = [...new Set(patch.technician_ids.filter(Boolean))];
    // Replace the whole crew: drop whoever is no longer on it, then add the
    // rest. Doing it the other way round would briefly empty a job that failed.
    let del = ctx.supabase
      .from("work_order_technicians")
      .delete()
      .eq("work_order_id", workOrderId)
      .eq("org_id", ctx.org.id);
    if (keep.length) del = del.not("technician_id", "in", `(${keep.join(",")})`);
    const { error: dErr } = await del;
    if (dErr) return fail(dErr.message);

    if (keep.length) {
      const { error: iErr } = await ctx.supabase.from("work_order_technicians").upsert(
        keep.map((technician_id) => ({
          org_id: ctx.org.id,
          work_order_id: workOrderId,
          technician_id,
        })),
        { onConflict: "work_order_id,technician_id" }
      );
      if (iErr) return fail(iErr.message);
    }
  }

  revalidatePath(`/work-orders/${workOrderId}`);
  return ok();
}

/**
 * The fields the printed service report asks for, saved together.
 *
 * One action rather than one per box: a technician fills the card in as a unit
 * and taps save once, and a partial patch is how a job ends up with a start
 * time and no finish. Only the keys sent are written, so the time card cannot
 * blank the mileage the other card just saved.
 */
export type ServiceReportPatch = {
  report_no?: string;
  customer_job_no?: string;
  billing?: string | null;
  work_kinds?: string[];
  started_at?: string | null;
  finished_at?: string | null;
  mileage_start?: number | null;
  mileage_end?: number | null;
};

const WORK_KINDS = ["installation", "repair", "cmn", "calibrate", "relocate", "pm"];
const BILLINGS = ["warranty", "contract", "paid"];

export async function saveServiceReport(
  workOrderId: string,
  patch: ServiceReportPatch
): Promise<ActionResult> {
  const ctx = await getSessionContext();
  const denied = await assertMayWork(ctx, workOrderId);
  if (denied) return fail(denied);

  const text = (v: string | undefined) => (v?.trim() ? v.trim() : null);
  const num = (v: number | null | undefined) =>
    v == null || !Number.isFinite(v) || v < 0 ? null : v;

  const update: Record<string, unknown> = {};
  if ("report_no" in patch) update.report_no = text(patch.report_no);
  if ("customer_job_no" in patch) update.customer_job_no = text(patch.customer_job_no);
  if ("billing" in patch)
    update.billing = patch.billing && BILLINGS.includes(patch.billing) ? patch.billing : null;
  if ("work_kinds" in patch)
    update.work_kinds = (patch.work_kinds ?? []).filter((k) => WORK_KINDS.includes(k));
  if ("started_at" in patch) update.started_at = patch.started_at || null;
  if ("finished_at" in patch) update.finished_at = patch.finished_at || null;
  if ("mileage_start" in patch) update.mileage_start = num(patch.mileage_start);
  if ("mileage_end" in patch) update.mileage_end = num(patch.mileage_end);
  if (Object.keys(update).length === 0) return ok();

  const { error } = await ctx.supabase
    .from("work_orders")
    .update(update)
    .eq("id", workOrderId)
    .eq("org_id", ctx.org.id);
  if (error) return fail(error.message);
  revalidatePath(`/work-orders/${workOrderId}`);
  revalidatePath("/my-jobs");
  return ok();
}

/**
 * Records the customer's signature for a job.
 *
 * The drawing is already in storage by the time this runs — the browser puts it
 * there directly, as it does for photos — so this only says which file it is and
 * who put their name to it. Signing again replaces the reference; the previous
 * drawing stays in the bucket rather than being deleted out from under a page
 * that may still be showing it.
 */
export async function saveWorkOrderSignature(
  workOrderId: string,
  path: string,
  signedBy: string
): Promise<ActionResult> {
  const ctx = await getSessionContext();
  const denied = await assertMayWork(ctx, workOrderId);
  if (denied) return fail(denied);

  const { error } = await ctx.supabase
    .from("work_orders")
    .update({
      signature_path: path,
      signed_by: signedBy.trim() || null,
      signed_at: new Date().toISOString(),
    })
    .eq("id", workOrderId)
    .eq("org_id", ctx.org.id);
  if (error) return fail(error.message);
  revalidatePath(`/work-orders/${workOrderId}`);
  revalidatePath("/my-jobs");
  return ok();
}

export async function deleteWorkOrderPart(
  id: string,
  workOrderId: string
): Promise<ActionResult> {
  const ctx = await getSessionContext();
  const denied = await assertMayWork(ctx, workOrderId);
  if (denied) return fail(denied);
  const { error } = await ctx.supabase
    .from("work_order_parts")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.org.id);
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
  // Delete the DB row first: if this fails the photo is untouched; an
  // orphaned storage object (row gone, remove fails) is harmless by contrast.
  const { error } = await supabase.from("work_order_photos").delete().eq("id", id);
  if (error) return fail(error.message);
  await supabase.storage.from("wo-photos").remove([path]);
  revalidatePath(`/work-orders/${workOrderId}`);
  return ok();
}
