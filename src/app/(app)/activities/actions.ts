"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import type { ActivityType } from "@/lib/database.types";

export type ActivityInput = {
  id?: string;
  type: ActivityType;
  subject: string;
  body?: string;
  due_date?: string | null;
  contact_id?: string | null;
  company_id?: string | null;
  deal_id?: string | null;
};

export async function saveActivity(input: ActivityInput): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const subject = input.subject?.trim();
  if (!subject) return fail("กรุณากรอกหัวข้อ");

  const payload = {
    org_id: org.id,
    type: input.type || "note",
    subject,
    body: input.body?.trim() || null,
    due_date: input.due_date ? new Date(input.due_date).toISOString() : null,
    contact_id: input.contact_id || null,
    company_id: input.company_id || null,
    deal_id: input.deal_id || null,
  };

  if (input.id) {
    const { error } = await supabase
      .from("activities")
      .update(payload)
      .eq("id", input.id);
    if (error) return fail(error.message);
  } else {
    const { error } = await supabase.from("activities").insert(payload);
    if (error) return fail(error.message);
  }

  revalidatePath("/activities");
  return ok();
}

export async function toggleActivity(
  id: string,
  done: boolean
): Promise<ActionResult> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase
    .from("activities")
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/activities");
  return ok();
}

export async function deleteActivity(id: string): Promise<ActionResult> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.from("activities").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/activities");
  return ok();
}
