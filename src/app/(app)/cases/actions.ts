"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext, type SessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import { CASE_ROLES } from "@/lib/roles";
import type { CaseStatus } from "@/lib/database.types";

export type CaseInput = {
  id?: string;
  subject: string;
  status: CaseStatus;
  case_type?: string;
  case_from?: string;
  note?: string;
  action?: string;
  employee?: string;
  team?: string;
  company_id?: string | null;
  contact_id?: string | null;
  site_id?: string | null;
  supporter_id?: string | null;
  /** Assets affected by this case, each with a reported condition. The first
   *  one is mirrored into cases.equipment_id for backward compatibility. */
  assets?: { equipment_id: string; condition?: AssetCondition | null }[];
  case_date?: string | null;
};

type AssetCondition = "operational" | "degraded" | "down";

/** Opening/managing cases is limited to Customer Service and Dispatcher
 *  (admin can always do everything). */
function canManageCases(ctx: Pick<SessionContext, "isAdmin" | "appRole">) {
  return ctx.isAdmin || CASE_ROLES.includes(ctx.appRole as (typeof CASE_ROLES)[number]);
}
const NO_PERMISSION = "เฉพาะ Customer Service / Dispatcher (หรือแอดมิน) เท่านั้นที่จัดการเคสได้";

/** Count work orders on a case that aren't finished (completed/cancelled). */
async function openWorkOrders(
  supabase: Awaited<ReturnType<typeof getSessionContext>>["supabase"],
  caseId: string
): Promise<number> {
  const { count } = await supabase
    .from("work_orders")
    .select("id", { count: "exact", head: true })
    .eq("case_id", caseId)
    .not("status", "in", "(completed,cancelled)");
  return count ?? 0;
}

const CLOSE_BLOCKED = (n: number) =>
  `ปิดเคสไม่ได้ — ยังมีใบสั่งงานที่ทำไม่เสร็จ ${n} รายการ (ต้องปิดงานให้เสร็จก่อน)`;

export async function saveCase(input: CaseInput): Promise<ActionResult> {
  const ctx = await getSessionContext();
  const { supabase, org } = ctx;
  if (!canManageCases(ctx)) return fail(NO_PERMISSION);
  const subject = input.subject?.trim();
  if (!subject) return fail("กรุณากรอกหัวข้อเคส");

  if (input.id && input.status === "closed") {
    const open = await openWorkOrders(supabase, input.id);
    if (open > 0) return fail(CLOSE_BLOCKED(open));
  }

  // De-duplicate the affected-assets list; keep the last condition given.
  const assetMap = new Map<string, AssetCondition | null>();
  for (const a of input.assets ?? []) {
    if (a?.equipment_id) assetMap.set(a.equipment_id, a.condition ?? null);
  }
  const assetList = [...assetMap.entries()].map(([equipment_id, condition]) => ({
    equipment_id,
    condition,
  }));

  const payload = {
    org_id: org.id,
    subject,
    status: input.status || "open",
    case_type: input.case_type?.trim() || null,
    case_from: input.case_from?.trim() || null,
    note: input.note?.trim() || null,
    action: input.action?.trim() || null,
    employee: input.employee?.trim() || null,
    team: input.team?.trim() || null,
    company_id: input.company_id || null,
    contact_id: input.contact_id || null,
    site_id: input.site_id || null,
    supporter_id: input.supporter_id || null,
    // First affected asset mirrored here for backward compatibility.
    equipment_id: assetList[0]?.equipment_id ?? null,
    case_date: input.case_date ? new Date(input.case_date).toISOString() : null,
  };

  // Reconcile the case ↔ asset links, then apply each reported condition to the
  // asset's operating status (a retired asset stays retired).
  async function syncCaseAssets(caseId: string): Promise<string | null> {
    // Replace the whole set: drop links no longer present, upsert the rest.
    const keepIds = assetList.map((a) => a.equipment_id);
    let del = supabase.from("case_assets").delete().eq("case_id", caseId);
    if (keepIds.length) del = del.not("equipment_id", "in", `(${keepIds.join(",")})`);
    const { error: delErr } = await del;
    if (delErr) return delErr.message;

    if (assetList.length) {
      const { error: upErr } = await supabase.from("case_assets").upsert(
        assetList.map((a) => ({
          org_id: org.id,
          case_id: caseId,
          equipment_id: a.equipment_id,
          condition: a.condition,
        })),
        { onConflict: "case_id,equipment_id" }
      );
      if (upErr) return upErr.message;
    }

    for (const a of assetList) {
      if (!a.condition) continue;
      const { error } = await supabase
        .from("equipment")
        .update({ status: a.condition })
        .eq("id", a.equipment_id)
        .eq("org_id", org.id)
        .neq("status", "retired");
      if (error) return error.message;
    }
    return null;
  }

  const caseId = input.id;
  if (caseId) {
    const { error } = await supabase.from("cases").update(payload).eq("id", caseId);
    if (error) return fail(error.message);
    const aErr = await syncCaseAssets(caseId);
    if (aErr) return fail("บันทึกเคสแล้ว แต่จัดการ Asset ไม่สำเร็จ: " + aErr);
    revalidatePath("/cases");
    revalidatePath("/assets");
    return ok(caseId);
  }
  const { data: created, error } = await supabase
    .from("cases")
    .insert(payload)
    .select("id")
    .single();
  if (error) return fail(error.message);
  const aErr = await syncCaseAssets(created.id);
  if (aErr) return fail("บันทึกเคสแล้ว แต่จัดการ Asset ไม่สำเร็จ: " + aErr);

  revalidatePath("/cases");
  revalidatePath("/assets");
  // Return the id so the client can upload queued attachments for a new case.
  return ok(created.id);
}

export async function updateCaseStatus(
  id: string,
  status: CaseStatus
): Promise<ActionResult> {
  const { supabase } = await getSessionContext();
  if (status === "closed") {
    const open = await openWorkOrders(supabase, id);
    if (open > 0) return fail(CLOSE_BLOCKED(open));
  }
  const { error } = await supabase.from("cases").update({ status }).eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/cases");
  return ok();
}

export async function deleteCase(id: string): Promise<ActionResult> {
  const ctx = await getSessionContext();
  if (!canManageCases(ctx)) return fail(NO_PERMISSION);
  const { error } = await ctx.supabase.from("cases").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/cases");
  return ok();
}

// ---- Attachments (photos / PDFs, e.g. repair-notice letters) ---------------
export async function addCaseAttachment(
  caseId: string,
  path: string,
  name: string,
  mime: string
): Promise<ActionResult> {
  const ctx = await getSessionContext();
  if (!canManageCases(ctx)) return fail(NO_PERMISSION);
  const { error } = await ctx.supabase.from("case_attachments").insert({
    org_id: ctx.org.id,
    case_id: caseId,
    path,
    name: name || null,
    mime: mime || null,
  });
  if (error) return fail(error.message);
  revalidatePath("/cases");
  return ok();
}

export async function deleteCaseAttachment(
  id: string,
  path: string
): Promise<ActionResult> {
  const ctx = await getSessionContext();
  if (!canManageCases(ctx)) return fail(NO_PERMISSION);
  // DB row first; an orphaned storage object is harmless by contrast.
  const { error } = await ctx.supabase.from("case_attachments").delete().eq("id", id);
  if (error) return fail(error.message);
  await ctx.supabase.storage.from("case-files").remove([path]);
  revalidatePath("/cases");
  return ok();
}
