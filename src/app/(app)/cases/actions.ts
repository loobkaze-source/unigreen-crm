"use server";

import { revalidatePath } from "next/cache";
import { CASE_DEPTS, DEFAULT_CASE_DEPT, type CaseDept } from "./constants";
import { getSessionContext, type SessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import { CASE_ROLES, hasRole } from "@/lib/roles";
import type { CaseStatus } from "@/lib/database.types";

export type CaseInput = {
  id?: string;
  subject: string;
  status: CaseStatus;
  case_type?: string;
  case_from?: string;
  /** Only read when creating: the code is fixed once the case has one. */
  dept_code?: string;
  customer_wo_ref?: string;
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
function canManageCases(ctx: Pick<SessionContext, "isAdmin" | "appRoles">) {
  return ctx.isAdmin || hasRole(ctx.appRoles, ...CASE_ROLES);
}
const NO_PERMISSION = "เฉพาะ Customer Service / Dispatcher (หรือแอดมิน) เท่านั้นที่จัดการเคสได้";

/**
 * Count work orders on a case that aren't finished (completed/cancelled).
 * A failed query must fail the close, not report zero — this guard exists
 * to stop a case closing over unfinished jobs.
 */
async function openWorkOrders(
  supabase: Awaited<ReturnType<typeof getSessionContext>>["supabase"],
  orgId: string,
  caseId: string
): Promise<{ open: number } | { error: string }> {
  const { count, error } = await supabase
    .from("work_orders")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("case_id", caseId)
    .not("status", "in", "(completed,cancelled)");
  if (error) return { error: error.message };
  return { open: count ?? 0 };
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
    const res = await openWorkOrders(supabase, org.id, input.id);
    if ("error" in res) return fail("ตรวจสอบใบสั่งงานของเคสไม่สำเร็จ: " + res.error);
    if (res.open > 0) return fail(CLOSE_BLOCKED(res.open));
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
    customer_wo_ref: input.customer_wo_ref?.trim() || null,
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
    let del = supabase
      .from("case_assets")
      .delete()
      .eq("org_id", org.id)
      .eq("case_id", caseId);
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

    // Independent per-asset updates — run them together, not one by one.
    const results = await Promise.all(
      assetList
        .filter((a) => a.condition)
        .map((a) =>
          supabase
            .from("equipment")
            .update({ status: a.condition })
            .eq("id", a.equipment_id)
            .eq("org_id", org.id)
            .neq("status", "retired")
        )
    );
    const firstErr = results.find((r) => r.error)?.error;
    return firstErr ? firstErr.message : null;
  }

  const caseId = input.id;
  if (caseId) {
    // `dept_code` is deliberately absent from `payload`: the code was built
    // from it at insert, and moving one without the other would leave a case
    // filed under a department its own number does not name.
    const { data: updated, error } = await supabase
      .from("cases")
      .update(payload)
      .eq("id", caseId)
      .eq("org_id", org.id)
      .select("id");
    if (error) return fail(error.message);
    if (!updated?.length) return fail("ไม่พบเคสนี้ในองค์กรของคุณ");
    const aErr = await syncCaseAssets(caseId);
    if (aErr) return fail("บันทึกเคสแล้ว แต่จัดการ Asset ไม่สำเร็จ: " + aErr);
    // "layout" also refreshes the per-case pages under /cases/[id].
  revalidatePath("/cases", "layout");
    revalidatePath("/assets");
    return ok(caseId);
  }
  const { data: created, error } = await supabase
    .from("cases")
    .insert({
      ...payload,
      // The trigger reads this, builds the code from it, and hands back a
      // serial for that department and month.
      dept_code: CASE_DEPTS.includes(input.dept_code as CaseDept)
        ? (input.dept_code as CaseDept)
        : DEFAULT_CASE_DEPT,
    })
    .select("id")
    .single();
  if (error) return fail(error.message);
  const aErr = await syncCaseAssets(created.id);
  if (aErr) return fail("บันทึกเคสแล้ว แต่จัดการ Asset ไม่สำเร็จ: " + aErr);

  // "layout" also refreshes the per-case pages under /cases/[id].
  revalidatePath("/cases", "layout");
  revalidatePath("/assets");
  // Return the id so the client can upload queued attachments for a new case.
  return ok(created.id);
}

/**
 * Creates a contact from a name and a phone number, and hands back its id.
 *
 * Whoever opens a case is usually on the phone to the person reporting the
 * fault, and that person is regularly not in the CRM yet. Leaving a half-written
 * case to go and add them properly is how the case stops getting written, so
 * the two things anybody has to hand are enough. The rest of the record can be
 * filled in from /contacts whenever somebody gets to it.
 */
export async function quickAddContact(input: {
  name: string;
  phone?: string;
  company_id?: string | null;
}): Promise<ActionResult> {
  const ctx = await getSessionContext();
  if (!canManageCases(ctx)) return fail(NO_PERMISSION);
  const name = input.name?.trim();
  if (!name) return fail("กรุณากรอกชื่อผู้ติดต่อ");

  // The table keeps a first name and a last name; someone typing into a case
  // form types one string, and the first space is the only split they mean.
  const cut = name.indexOf(" ");
  const first = cut === -1 ? name : name.slice(0, cut);
  const last = cut === -1 ? null : name.slice(cut + 1).trim() || null;

  const { data, error } = await ctx.supabase
    .from("contacts")
    .insert({
      org_id: ctx.org.id,
      first_name: first,
      last_name: last,
      phone: input.phone?.trim() || null,
      company_id: input.company_id || null,
    })
    .select("id")
    .single();
  if (error) return fail(error.message);

  revalidatePath("/contacts");
  // "layout" also refreshes the per-case pages under /cases/[id].
  revalidatePath("/cases", "layout");
  return ok(data.id as string);
}

export async function updateCaseStatus(
  id: string,
  status: CaseStatus
): Promise<ActionResult> {
  const ctx = await getSessionContext();
  const { supabase, org } = ctx;
  if (!canManageCases(ctx)) return fail(NO_PERMISSION);
  if (status === "closed") {
    const res = await openWorkOrders(supabase, org.id, id);
    if ("error" in res) return fail("ตรวจสอบใบสั่งงานของเคสไม่สำเร็จ: " + res.error);
    if (res.open > 0) return fail(CLOSE_BLOCKED(res.open));
  }
  const { data: updated, error } = await supabase
    .from("cases")
    .update({ status })
    .eq("id", id)
    .eq("org_id", org.id)
    .select("id");
  if (error) return fail(error.message);
  if (!updated?.length) return fail("ไม่พบเคสนี้ในองค์กรของคุณ");
  // "layout" also refreshes the per-case pages under /cases/[id].
  revalidatePath("/cases", "layout");
  return ok();
}

export async function deleteCase(id: string): Promise<ActionResult> {
  const ctx = await getSessionContext();
  if (!canManageCases(ctx)) return fail(NO_PERMISSION);
  const { error } = await ctx.supabase
    .from("cases")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.org.id);
  if (error) return fail(error.message);
  // "layout" also refreshes the per-case pages under /cases/[id].
  revalidatePath("/cases", "layout");
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
  // The parent case must be ours — org_id on the attachment alone would let a
  // row be filed under one org while hanging off another org's case.
  const { data: parent, error: pErr } = await ctx.supabase
    .from("cases")
    .select("id")
    .eq("id", caseId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (pErr) return fail(pErr.message);
  if (!parent) return fail("ไม่พบเคสนี้ในองค์กรของคุณ");
  const { error } = await ctx.supabase.from("case_attachments").insert({
    org_id: ctx.org.id,
    case_id: caseId,
    path,
    name: name || null,
    mime: mime || null,
  });
  if (error) return fail(error.message);
  // "layout" also refreshes the per-case pages under /cases/[id].
  revalidatePath("/cases", "layout");
  return ok();
}

export async function deleteCaseAttachment(id: string): Promise<ActionResult> {
  const ctx = await getSessionContext();
  if (!canManageCases(ctx)) return fail(NO_PERMISSION);
  // DB row first; an orphaned storage object is harmless by contrast. The
  // storage path comes from the deleted row itself — never from the caller,
  // who could otherwise aim it at any object in the bucket.
  const { data: deleted, error } = await ctx.supabase
    .from("case_attachments")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.org.id)
    .select("path");
  if (error) return fail(error.message);
  const path = deleted?.[0]?.path;
  if (path) await ctx.supabase.storage.from("case-files").remove([path]);
  // "layout" also refreshes the per-case pages under /cases/[id].
  revalidatePath("/cases", "layout");
  return ok();
}
