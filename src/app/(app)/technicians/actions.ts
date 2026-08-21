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
  // Edit-only: a technician record always belongs to an admin-created user
  // account. A free-floating row here would be assignable to jobs but unable
  // to sign in, accept work, or appear in /my-jobs.
  if (!input.id) {
    return fail(
      "เพิ่มช่างโดยตรงไม่ได้ — สร้างผู้ใช้ role Technician ที่หน้าผู้ใช้ (แอดมิน) แล้วระบบจะเพิ่มเข้าทะเบียนช่างให้"
    );
  }
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

  const { data: updated, error } = await supabase
    .from("technicians")
    .update(payload)
    .eq("id", input.id)
    .eq("org_id", org.id)
    .select("id");
  if (error) return fail(error.message);
  if (!updated?.length) return fail("ไม่พบช่างคนนี้ในองค์กรของคุณ");

  revalidatePath("/technicians");
  revalidatePath("/work-orders");
  return ok();
}

/**
 * Create technician records for every user holding the 'Technician' role that
 * isn't already linked to one. Idempotent.
 */
export async function importTechniciansFromUsers(): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();

  // The two scans are independent — run them together. A failed read must
  // fail the import, not report "success" having imported nobody.
  const [membersRes, existingRes] = await Promise.all([
    supabase
      .from("organization_members")
      .select("user_id")
      .eq("org_id", org.id)
      .contains("app_roles", ["Technician"]),
    supabase
      .from("technicians")
      .select("user_id")
      .eq("org_id", org.id)
      .not("user_id", "is", null),
  ]);
  if (membersRes.error) return fail(membersRes.error.message);
  if (existingRes.error) return fail(existingRes.error.message);
  const userIds = [...new Set((membersRes.data ?? []).map((m) => m.user_id as string))];
  if (!userIds.length) return ok();
  const linked = new Set((existingRes.data ?? []).map((t) => t.user_id as string));

  const toAdd = userIds.filter((id) => !linked.has(id));
  if (!toAdd.length) return ok();

  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", toAdd);
  if (pErr) return fail(pErr.message);
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
  const { supabase, org } = await getSessionContext();
  const { error } = await supabase
    .from("technicians")
    .delete()
    .eq("id", id)
    .eq("org_id", org.id);
  if (error) return fail(error.message);
  revalidatePath("/technicians");
  return ok();
}
