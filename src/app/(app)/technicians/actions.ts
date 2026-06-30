"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";

export type TechnicianInput = {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  skill?: string;
  active?: boolean;
};

export async function saveTechnician(
  input: TechnicianInput
): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const name = input.name?.trim();
  if (!name) return fail("กรุณากรอกชื่อช่าง");

  const payload = {
    org_id: org.id,
    name,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    skill: input.skill?.trim() || null,
    active: input.active ?? true,
  };

  if (input.id) {
    const { error } = await supabase
      .from("technicians")
      .update(payload)
      .eq("id", input.id);
    if (error) return fail(error.message);
  } else {
    const { error } = await supabase.from("technicians").insert(payload);
    if (error) return fail(error.message);
  }

  revalidatePath("/technicians");
  revalidatePath("/work-orders");
  return ok();
}

export async function deleteTechnician(id: string): Promise<ActionResult> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.from("technicians").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/technicians");
  return ok();
}
