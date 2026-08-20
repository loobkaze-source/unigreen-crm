"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";

export type DealInput = {
  id?: string;
  title: string;
  value?: string | number | null;
  currency?: string;
  stage_id: string;
  department?: string;
  company_id?: string | null;
  contact_id?: string | null;
  expected_close_date?: string | null;
  notes?: string;
};

function parseValue(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The stage a deal points at must be OUR stage, and the deal's department must
 * be the board that stage lives on — otherwise the deal files under a column
 * no board renders and disappears from every view.
 */
async function stageBoard(
  supabase: Awaited<ReturnType<typeof getSessionContext>>["supabase"],
  orgId: string,
  stageId: string
): Promise<{ board: string } | { error: string }> {
  const { data, error } = await supabase
    .from("stages")
    .select("board_key")
    .eq("id", stageId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "ไม่พบขั้นตอนไปป์ไลน์นี้" };
  return { board: data.board_key as string };
}

export async function saveDeal(input: DealInput): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const title = input.title?.trim();
  if (!title) return fail("กรุณากรอกชื่อดีล");
  if (!input.stage_id) return fail("กรุณาเลือกขั้นตอนไปป์ไลน์");

  const stage = await stageBoard(supabase, org.id, input.stage_id);
  if ("error" in stage) return fail(stage.error);

  const payload = {
    org_id: org.id,
    title,
    value: parseValue(input.value),
    currency: input.currency?.trim() || "THB",
    stage_id: input.stage_id,
    // The stage's board is the source of truth for which board the deal is on.
    department: stage.board,
    company_id: input.company_id || null,
    contact_id: input.contact_id || null,
    expected_close_date: input.expected_close_date || null,
    notes: input.notes?.trim() || null,
  };

  if (input.id) {
    const { data: updated, error } = await supabase
      .from("deals")
      .update(payload)
      .eq("id", input.id)
      .eq("org_id", org.id)
      .select("id");
    if (error) return fail(error.message);
    if (!updated?.length) return fail("ไม่พบดีลนี้ในองค์กรของคุณ");
  } else {
    const { error } = await supabase.from("deals").insert(payload);
    if (error) return fail(error.message);
  }

  revalidatePath("/deals");
  return ok();
}

/** Lightweight update used by drag-and-drop between columns. */
export async function updateDealStage(
  id: string,
  stageId: string
): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const stage = await stageBoard(supabase, org.id, stageId);
  if ("error" in stage) return fail(stage.error);
  // Keep department in step with the stage's board — a replayed payload with a
  // foreign stage id must not strand the deal between two boards.
  const { data: updated, error } = await supabase
    .from("deals")
    .update({ stage_id: stageId, department: stage.board })
    .eq("id", id)
    .eq("org_id", org.id)
    .select("id");
  if (error) return fail(error.message);
  if (!updated?.length) return fail("ไม่พบดีลนี้ในองค์กรของคุณ");
  revalidatePath("/deals");
  return ok();
}

export async function deleteDeal(id: string): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const { error } = await supabase
    .from("deals")
    .delete()
    .eq("id", id)
    .eq("org_id", org.id);
  if (error) return fail(error.message);
  revalidatePath("/deals");
  return ok();
}
