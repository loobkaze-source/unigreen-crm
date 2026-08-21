"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import { isTechnicianOnly } from "@/lib/roles";
import { SERVICE_BOARDS } from "@/lib/departments";
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
  /** Raised for one round of a contract: the visit it serves. */
  visit_id?: string | null;
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
  let del = supabase
    .from("work_order_assets")
    .delete()
    .eq("org_id", orgId)
    .eq("work_order_id", workOrderId);
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
    billing: oneOf(input.billing, ["warranty", "contract", "paid"]),
    asset_id: assetIds[0] ?? null, // keep the single column pointing at the first
    board_key: oneOf(input.board_key, SERVICE_BOARDS.map((b) => b.value)),
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
  if (input.id) {
    // completed_at marks the moment the job FINISHED — stamp it only on the
    // transition into completed. Editing a long-finished job's description
    // must not restamp its history (or re-trigger the asset restore).
    const { data: existing, error: exErr } = await supabase
      .from("work_orders")
      .select("status")
      .eq("id", input.id)
      .eq("org_id", org.id)
      .maybeSingle();
    if (exErr) return fail(exErr.message);
    if (!existing) return fail("ไม่พบใบสั่งงานนี้ในองค์กรของคุณ");
    const becameCompleted =
      input.status === "completed" && existing.status !== "completed";
    if (becameCompleted) payload.completed_at = new Date().toISOString();
    else if (input.status !== "completed" && existing.status === "completed")
      payload.completed_at = null;

    const { error } = await supabase
      .from("work_orders")
      .update(payload)
      .eq("id", input.id)
      .eq("org_id", org.id);
    if (error) return fail(error.message);
    const aErr = await syncAssets(supabase, org.id, input.id, assetIds);
    if (aErr) return fail(aErr);
    if (becameCompleted) {
      const rErr = await restoreAssetsOnComplete(supabase, org.id, input.id);
      if (rErr) return fail("บันทึกงานแล้ว แต่ปรับสถานะเครื่องไม่สำเร็จ: " + rErr);
    }
    revalidatePath(`/work-orders/${input.id}`, "layout");
    revalidatePath("/my-jobs");
  } else {
    if (input.status === "completed") payload.completed_at = new Date().toISOString();
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
    // A job raised for a round of a contract is that round's evidence, so the
    // round points at it from the moment it exists.
    if (input.visit_id) {
      const { error: vErr } = await supabase
        .from("service_visits")
        .update({ work_order_id: data.id })
        .eq("id", input.visit_id)
        .eq("org_id", org.id);
      if (vErr) {
        // The job exists — say so, and say the round didn't get linked.
        return fail("สร้างใบสั่งงานแล้ว แต่ผูกกับรอบบริการไม่สำเร็จ: " + vErr.message);
      }
      if (input.contract_id) revalidatePath(`/service-contracts/${input.contract_id}`);
      revalidatePath("/service-contracts");
    }
    revalidatePath("/work-orders");
    revalidatePath("/service-board");
    return ok(data.id);
  }

  revalidatePath("/work-orders");
  revalidatePath("/service-board");
  return ok(input.id);
}

/**
 * When a work order completes, machines it covered that were reported
 * degraded/down go back to operational (retired assets are left alone).
 * Returns an error message or null — a silent failure here leaves the fleet
 * register showing a repaired machine as still down.
 */
async function restoreAssetsOnComplete(
  supabase: Awaited<ReturnType<typeof getSessionContext>>["supabase"],
  orgId: string,
  workOrderId: string
): Promise<string | null> {
  const [woRes, linksRes] = await Promise.all([
    supabase.from("work_orders").select("asset_id").eq("id", workOrderId).maybeSingle(),
    supabase
      .from("work_order_assets")
      .select("equipment_id")
      .eq("work_order_id", workOrderId),
  ]);
  if (woRes.error) return woRes.error.message;
  if (linksRes.error) return linksRes.error.message;
  const ids = new Set<string>();
  if (woRes.data?.asset_id) ids.add(woRes.data.asset_id as string);
  (linksRes.data ?? []).forEach((l) => ids.add(l.equipment_id as string));
  if (ids.size === 0) return null;
  const { error } = await supabase
    .from("equipment")
    .update({ status: "operational" })
    .in("id", [...ids])
    .eq("org_id", orgId)
    .in("status", ["degraded", "down"]);
  if (error) return error.message;
  revalidatePath("/assets");
  return null;
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

/**
 * Guard for every per-job action: the job must exist in the caller's org
 * (anyone), and a field-only technician may only touch their own job.
 * The two lookups don't depend on each other, so they run together.
 */
async function assertMayWork(
  ctx: Awaited<ReturnType<typeof getSessionContext>>,
  workOrderId: string
): Promise<string | null> {
  const fieldTech = !ctx.isAdmin && isTechnicianOnly(ctx.appRoles);
  const [techId, woRes] = await Promise.all([
    fieldTech ? myTechnicianId(ctx) : Promise.resolve(null),
    ctx.supabase
      .from("work_orders")
      .select("technician_id")
      .eq("id", workOrderId)
      .eq("org_id", ctx.org.id)
      .maybeSingle(),
  ]);
  if (woRes.error) return woRes.error.message;
  if (!woRes.data) return "ไม่พบใบสั่งงานนี้ในองค์กรของคุณ";
  if (!fieldTech) return null;
  return techId && woRes.data.technician_id === techId ? null : NOT_YOURS;
}

/** The assigned technician acknowledges the job ("กดรับงาน"). */
export async function acceptWorkOrder(id: string): Promise<ActionResult> {
  const ctx = await getSessionContext();
  const { supabase, org, userId } = ctx;

  // Both lookups need only the session — run them together.
  const [techId, woRes] = await Promise.all([
    myTechnicianId(ctx),
    supabase
      .from("work_orders")
      .select("technician_id, accepted_at")
      .eq("id", id)
      .eq("org_id", org.id)
      .maybeSingle(),
  ]);
  if (woRes.error) return fail(woRes.error.message);
  const wo = woRes.data;
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
  revalidatePath("/service-board");
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

  /**
   * A job is not finished until the customer has put their name to it. Enforced
   * here rather than only on the button, because the same status can be set
   * from the job page's dropdown — and a rule that lives in one screen is not a
   * rule. Cancelling is untouched: a job called off was never done.
   *
   * A job being back-entered as already finished goes in through the edit form,
   * which does not come through here.
   */
  if (status === "completed") {
    const { data: wo } = await supabase
      .from("work_orders")
      .select("signature_path")
      .eq("id", id)
      .eq("org_id", org.id)
      .maybeSingle();
    if (!wo?.signature_path) {
      return fail("ยังไม่มีลายเซ็นลูกค้า — ขอลายเซ็นก่อนจึงจะปิดงานได้");
    }
  }

  const { error } = await supabase
    .from("work_orders")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("org_id", org.id);
  if (error) return fail(error.message);
  if (status === "completed") {
    const rErr = await restoreAssetsOnComplete(supabase, org.id, id);
    if (rErr) return fail("ปิดงานแล้ว แต่ปรับสถานะเครื่องไม่สำเร็จ: " + rErr);
  }
  // A contract's progress is read from its rounds' jobs, so a page showing it
  // has to be told when one of those jobs moves.
  revalidatePath("/service-contracts");
  revalidatePath("/my-jobs");
  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`, "layout");
  revalidatePath("/service-board");
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
  revalidatePath("/service-board");
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
  // "No price recorded" stays null — Number(null) is 0, which on a billed job
  // is a real (and wrong) price.
  const price = unitPrice == null ? null : Number(unitPrice);
  const { error } = await ctx.supabase.from("work_order_parts").insert({
    org_id: ctx.org.id,
    work_order_id: workOrderId,
    equipment_id: equipmentId || null,
    name: label,
    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    unit: unit?.trim() || null,
    unit_price: price != null && Number.isFinite(price) && price >= 0 ? price : null,
    source: source === "store" || source === "labor" ? source : "material",
  });
  if (error) return fail(error.message);
  // "layout" also refreshes the nested /report page these fields print on.
  revalidatePath(`/work-orders/${workOrderId}`, "layout");
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
  // "layout" also refreshes the nested /report page these fields print on.
  revalidatePath(`/work-orders/${workOrderId}`, "layout");
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
    fault_codes?: string[];
    repair_codes?: string[];
    causes?: string[];
    remedy?: string;
    technician_ids?: string[];
  }
): Promise<ActionResult> {
  const ctx = await getSessionContext();
  const denied = await assertMayWork(ctx, workOrderId);
  if (denied) return fail(denied);

  const update: Record<string, unknown> = {};
  for (const k of ["fault_codes", "repair_codes", "causes"] as const) {
    // Trimmed and de-duplicated here as well as in the field: the same tag typed
    // with a trailing space is the same tag, and only this end can be sure.
    if (k in patch) {
      const seen = new Set<string>();
      update[k] = (patch[k] ?? [])
        .map((t) => t.trim())
        .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
    }
  }
  if ("remedy" in patch) update.remedy = patch.remedy?.trim() || null;
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

  // "layout" also refreshes the nested /report page these fields print on.
  revalidatePath(`/work-orders/${workOrderId}`, "layout");
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
  // Normalize through iso() like every other timestamp, and refuse an
  // inverted time card — the exact bad record this card exists to prevent.
  if ("started_at" in patch) update.started_at = iso(patch.started_at);
  if ("finished_at" in patch) update.finished_at = iso(patch.finished_at);
  if (
    typeof update.started_at === "string" &&
    typeof update.finished_at === "string" &&
    update.finished_at < update.started_at
  ) {
    return fail("เวลาเสร็จงานต้องไม่มาก่อนเวลาเริ่มงาน");
  }
  if ("mileage_start" in patch) update.mileage_start = num(patch.mileage_start);
  if ("mileage_end" in patch) update.mileage_end = num(patch.mileage_end);
  if (Object.keys(update).length === 0) return ok();

  const { error } = await ctx.supabase
    .from("work_orders")
    .update(update)
    .eq("id", workOrderId)
    .eq("org_id", ctx.org.id);
  if (error) return fail(error.message);
  // "layout" also refreshes the nested /report page these fields print on.
  revalidatePath(`/work-orders/${workOrderId}`, "layout");
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
  // "layout" also refreshes the nested /report page these fields print on.
  revalidatePath(`/work-orders/${workOrderId}`, "layout");
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
  // "layout" also refreshes the nested /report page these fields print on.
  revalidatePath(`/work-orders/${workOrderId}`, "layout");
  return ok();
}

// ---- Photos ---------------------------------------------------------------
export async function addWorkOrderPhoto(
  workOrderId: string,
  path: string,
  section?: string
): Promise<ActionResult> {
  const ctx = await getSessionContext();
  const denied = await assertMayWork(ctx, workOrderId);
  if (denied) return fail(denied);
  // Land it at the end of the run rather than at position 0, where a photo
  // added to the last heading would otherwise drag that whole heading to the
  // top of the page. Two uploads racing for the same number is harmless —
  // created_at breaks the tie in the order they arrived.
  const { data: last } = await ctx.supabase
    .from("work_order_photos")
    .select("position")
    .eq("work_order_id", workOrderId)
    .order("position", { ascending: false })
    .limit(1);
  const { error } = await ctx.supabase.from("work_order_photos").insert({
    org_id: ctx.org.id,
    work_order_id: workOrderId,
    path,
    position: ((last?.[0]?.position as number) ?? -1) + 1,
    section: section?.trim() || null,
  });
  if (error) return fail(error.message);
  // "layout" also refreshes the nested /report page these fields print on.
  revalidatePath(`/work-orders/${workOrderId}`, "layout");
  return ok();
}

/**
 * The caption under a site photo.
 *
 * A photograph of a corroded fitting says nothing on its own once the visit is
 * a year old, and the report prints these under each picture — so this is the
 * difference between evidence and a page of pipes.
 */
export async function saveWorkOrderPhotoCaption(
  id: string,
  caption: string,
  workOrderId: string
): Promise<ActionResult> {
  const ctx = await getSessionContext();
  const denied = await assertMayWork(ctx, workOrderId);
  if (denied) return fail(denied);

  const { error } = await ctx.supabase
    .from("work_order_photos")
    .update({ caption: caption.trim() || null })
    .eq("id", id)
    .eq("org_id", ctx.org.id);
  if (error) return fail(error.message);
  // "layout" also refreshes the nested /report page these fields print on.
  revalidatePath(`/work-orders/${workOrderId}`, "layout");
  return ok();
}

/**
 * The order the site photos are shown and printed in, and the heading each one
 * falls under.
 *
 * Order and heading travel together because on this card they are one gesture:
 * a photo dragged under "รูปหลังทำงาน" both moves and joins. Given as the whole
 * list rather than as a move to be replayed, so two drags in quick succession
 * cannot land out of sequence and leave the page in an order nobody chose.
 */
export async function arrangeWorkOrderPhotos(
  workOrderId: string,
  items: { id: string; section: string }[]
): Promise<ActionResult> {
  const ctx = await getSessionContext();
  const denied = await assertMayWork(ctx, workOrderId);
  if (denied) return fail(denied);

  // One round trip per photo, but all in flight together — a 30-photo job
  // rearranges in one network beat instead of thirty.
  const results = await Promise.all(
    items.map((item, position) =>
      ctx.supabase
        .from("work_order_photos")
        .update({ position, section: item.section.trim() || null })
        .eq("id", item.id)
        .eq("work_order_id", workOrderId)
        .eq("org_id", ctx.org.id)
    )
  );
  const firstErr = results.find((r) => r.error)?.error;
  if (firstErr) return fail(firstErr.message);
  // "layout" also refreshes the nested /report page these fields print on.
  revalidatePath(`/work-orders/${workOrderId}`, "layout");
  return ok();
}

export async function deleteWorkOrderPhoto(
  id: string,
  workOrderId: string
): Promise<ActionResult> {
  const ctx = await getSessionContext();
  const denied = await assertMayWork(ctx, workOrderId);
  if (denied) return fail(denied);
  // Delete the DB row first: if this fails the photo is untouched; an
  // orphaned storage object (row gone, remove fails) is harmless by contrast.
  // The storage path comes from the deleted row — never from the caller, who
  // could otherwise aim it at any object in the bucket.
  const { data: deleted, error } = await ctx.supabase
    .from("work_order_photos")
    .delete()
    .eq("id", id)
    .eq("work_order_id", workOrderId)
    .eq("org_id", ctx.org.id)
    .select("path");
  if (error) return fail(error.message);
  const path = deleted?.[0]?.path;
  if (path) await ctx.supabase.storage.from("wo-photos").remove([path]);
  // "layout" also refreshes the nested /report page these fields print on.
  revalidatePath(`/work-orders/${workOrderId}`, "layout");
  return ok();
}
