"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import { DEPARTMENTS } from "@/lib/departments";
import { USER_ROLES } from "@/lib/roles";

const isRole = (v: string) =>
  USER_ROLES.includes(v as (typeof USER_ROLES)[number]) ? v : null;
const isDept = (v: string) =>
  DEPARTMENTS.some((d) => d.value === v) ? v : null;

/** Only owners/admins may manage the team. */
async function requireAdmin() {
  const ctx = await getSessionContext();
  if (!ctx.isAdmin) return { ctx, error: "เฉพาะแอดมินเท่านั้น" as const };
  return { ctx, error: null };
}

export async function updateMember(
  memberId: string,
  appRole: string,
  department: string
): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (error) return fail(error);
  const role = isRole(appRole);
  const membershipRole = role === "admin" ? "admin" : "member";
  const { error: e } = await ctx.supabase
    .from("organization_members")
    .update({
      app_role: role,
      department: role === "admin" ? null : isDept(department),
      role: membershipRole,
    })
    .eq("id", memberId)
    .eq("org_id", ctx.org.id)
    .neq("role", "owner");
  if (e) return fail(e.message);
  revalidatePath("/users");
  return ok();
}

/** Admin creates a user directly with an initial password (no email). */
export async function createUser(input: {
  email: string;
  fullName: string;
  password: string;
  appRole: string;
  department: string;
}): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (error) return fail(error);

  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) return fail("อีเมลไม่ถูกต้อง");
  if ((input.password || "").length < 6)
    return fail("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "ตั้งค่า service key ไม่ถูกต้อง");
  }

  const role = isRole(input.appRole);
  const department = role === "admin" ? null : isDept(input.department);

  // Pre-create an invite so the signup trigger routes the new account into this
  // org with the right role/department (and satisfies invite-only signup).
  const { error: invErr } = await ctx.supabase.from("invites").upsert(
    { org_id: ctx.org.id, email, app_role: role, department },
    { onConflict: "org_id,email" }
  );
  if (invErr) return fail(invErr.message);

  const { data, error: e } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName.trim() || email.split("@")[0] },
  });
  if (e) {
    await ctx.supabase.from("invites").delete().eq("org_id", ctx.org.id).eq("email", email);
    return fail(/already|exists|registered/i.test(e.message) ? "อีเมลนี้มีบัญชีอยู่แล้ว" : e.message);
  }

  // Force a password change on first login.
  if (data.user) {
    await admin.from("profiles").update({ must_change_password: true }).eq("id", data.user.id);
  }
  revalidatePath("/users");
  return ok();
}

/** Admin resets a member's password to a new temp value; forces a change. */
export async function resetUserPassword(
  memberId: string,
  newPassword: string
): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (error) return fail(error);
  if ((newPassword || "").length < 6)
    return fail("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");

  const { data: mem } = await ctx.supabase
    .from("organization_members")
    .select("user_id")
    .eq("id", memberId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!mem?.user_id) return fail("ไม่พบสมาชิก");

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "ตั้งค่า service key ไม่ถูกต้อง");
  }

  const { error: e } = await admin.auth.admin.updateUserById(mem.user_id as string, {
    password: newPassword,
  });
  if (e) return fail(e.message);
  await admin.from("profiles").update({ must_change_password: true }).eq("id", mem.user_id);
  revalidatePath("/users");
  return ok();
}

export async function removeMember(memberId: string): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (error) return fail(error);
  const { error: e } = await ctx.supabase
    .from("organization_members")
    .delete()
    .eq("id", memberId)
    .eq("org_id", ctx.org.id)
    .neq("role", "owner");
  if (e) return fail(e.message);
  revalidatePath("/users");
  return ok();
}
