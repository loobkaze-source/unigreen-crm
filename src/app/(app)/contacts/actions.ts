"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";

export type ContactInput = {
  id?: string;
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  title?: string;
  company_id?: string | null;
  notes?: string;
};

export async function saveContact(input: ContactInput): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const first = input.first_name?.trim();
  if (!first) return fail("กรุณากรอกชื่อ");

  const payload = {
    org_id: org.id,
    first_name: first,
    last_name: input.last_name?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    title: input.title?.trim() || null,
    company_id: input.company_id || null,
    notes: input.notes?.trim() || null,
  };

  if (input.id) {
    const { data: updated, error } = await supabase
      .from("contacts")
      .update(payload)
      .eq("id", input.id)
      .eq("org_id", org.id)
      .select("id");
    if (error) return fail(error.message);
    if (!updated?.length) return fail("ไม่พบผู้ติดต่อนี้ในองค์กรของคุณ");
  } else {
    const { error } = await supabase.from("contacts").insert(payload);
    if (error) return fail(error.message);
  }

  revalidatePath("/contacts");
  return ok();
}

export async function deleteContact(id: string): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const { error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", id)
    .eq("org_id", org.id);
  if (error) return fail(error.message);
  revalidatePath("/contacts");
  return ok();
}
