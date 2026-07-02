"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import { displayUsername, USERNAME_DOMAIN } from "@/lib/username";

const realEmail = (email: string | null | undefined) =>
  email && !email.toLowerCase().endsWith(`@${USERNAME_DOMAIN}`) ? email : null;

export type TechnicianInput = {
  id?: string;
  name: string;
  nickname?: string;
  email?: string;
  phone?: string;
  skills?: string[];
  certifications?: string[];
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
    nickname: input.nickname?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    skills: input.skills ?? [],
    certifications: input.certifications ?? [],
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

/**
 * Create technician records for every user with app_role = 'Technician' that
 * isn't already linked to one. Idempotent.
 */
export async function importTechniciansFromUsers(): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();

  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("org_id", org.id)
    .eq("app_role", "Technician");
  const userIds = [...new Set((members ?? []).map((m) => m.user_id as string))];
  if (!userIds.length) return ok();

  const { data: existing } = await supabase
    .from("technicians")
    .select("user_id")
    .eq("org_id", org.id)
    .not("user_id", "is", null);
  const linked = new Set((existing ?? []).map((t) => t.user_id as string));

  const toAdd = userIds.filter((id) => !linked.has(id));
  if (!toAdd.length) return ok();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", toAdd);
  const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const rows = toAdd.map((uid) => {
    const p = pmap.get(uid);
    return {
      org_id: org.id,
      user_id: uid,
      name: p?.full_name || displayUsername(p?.email) || "ช่าง",
      email: realEmail(p?.email),
      skills: [] as string[],
      certifications: [] as string[],
      active: true,
    };
  });
  const { error } = await supabase
    .from("technicians")
    .upsert(rows, { onConflict: "org_id,user_id", ignoreDuplicates: true });
  if (error) return fail(error.message);

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
