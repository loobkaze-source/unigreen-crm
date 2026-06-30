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

export async function saveDeal(input: DealInput): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const title = input.title?.trim();
  if (!title) return fail("กรุณากรอกชื่อดีล");
  if (!input.stage_id) return fail("กรุณาเลือกขั้นตอนไปป์ไลน์");

  const payload = {
    org_id: org.id,
    title,
    value: parseValue(input.value),
    currency: input.currency?.trim() || "USD",
    stage_id: input.stage_id,
    department: input.department || "unigreen",
    company_id: input.company_id || null,
    contact_id: input.contact_id || null,
    expected_close_date: input.expected_close_date || null,
    notes: input.notes?.trim() || null,
  };

  if (input.id) {
    const { error } = await supabase
      .from("deals")
      .update(payload)
      .eq("id", input.id);
    if (error) return fail(error.message);
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
  const { supabase } = await getSessionContext();
  const { error } = await supabase
    .from("deals")
    .update({ stage_id: stageId })
    .eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/deals");
  return ok();
}

export async function deleteDeal(id: string): Promise<ActionResult> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.from("deals").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/deals");
  return ok();
}
