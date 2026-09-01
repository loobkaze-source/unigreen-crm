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
  /** Who is booked on it. Only a training session has any. */
  technician_ids?: string[];
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

  let id = input.id;
  if (input.id) {
    const { data: updated, error } = await supabase
      .from("activities")
      .update(payload)
      .eq("id", input.id)
      .eq("org_id", org.id)
      .select("id");
    if (error) return fail(error.message);
    if (!updated?.length) return fail("ไม่พบกิจกรรมนี้ในองค์กรของคุณ");
  } else {
    const { data: created, error } = await supabase
      .from("activities")
      .insert(payload)
      .select("id")
      .single();
    if (error) return fail(error.message);
    id = created.id;
  }

  // The attendee list is sent whole and replaced whole: a name taken off the
  // course has to actually come off it, and a diff of one list against another
  // is more ways to be wrong than a delete and an insert.
  if (id && input.technician_ids) {
    const wanted = [...new Set(input.technician_ids.filter(Boolean))];
    const { error: delErr } = await supabase
      .from("activity_technicians")
      .delete()
      .eq("activity_id", id)
      .eq("org_id", org.id);
    if (delErr) return fail(delErr.message);
    if (wanted.length) {
      const { error: insErr } = await supabase.from("activity_technicians").insert(
        wanted.map((technician_id) => ({
          org_id: org.id,
          activity_id: id as string,
          technician_id,
        }))
      );
      if (insErr) return fail(insErr.message);
    }
  }

  revalidatePath("/activities");
  // The dashboard lists upcoming activities.
  revalidatePath("/dashboard");
  return ok();
}

export async function toggleActivity(
  id: string,
  done: boolean
): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const { error } = await supabase
    .from("activities")
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("org_id", org.id);
  if (error) return fail(error.message);
  revalidatePath("/activities");
  revalidatePath("/dashboard");
  return ok();
}

export async function deleteActivity(id: string): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const { error } = await supabase
    .from("activities")
    .delete()
    .eq("id", id)
    .eq("org_id", org.id);
  if (error) return fail(error.message);
  revalidatePath("/activities");
  revalidatePath("/dashboard");
  return ok();
}
