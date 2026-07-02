"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import { DEPARTMENTS } from "@/lib/departments";
import { USER_ROLES } from "@/lib/roles";
import { toAuthEmail, isValidLoginId, displayUsername, USERNAME_DOMAIN } from "@/lib/username";

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

/** Create/link a technician record for a Technician-role user (idempotent).
 *  Returns an error message, or null on success. */
async function ensureTechnician(
  supabase: Awaited<ReturnType<typeof getSessionContext>>["supabase"],
  orgId: string,
  userId: string
): Promise<string | null> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  const email =
    prof?.email && !String(prof.email).toLowerCase().endsWith(`@${USERNAME_DOMAIN}`)
      ? prof.email
      : null;
  const { error } = await supabase.from("technicians").upsert(
    {
      org_id: orgId,
      user_id: userId,
      name: prof?.full_name || displayUsername(prof?.email) || "ช่าง",
      email,
      skills: [],
      active: true,
    },
    { onConflict: "org_id,user_id", ignoreDuplicates: true }
  );
  return error?.message ?? null;
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

  if (role === "Technician") {
    const { data: mem } = await ctx.supabase
      .from("organization_members")
      .select("user_id")
      .eq("id", memberId)
      .eq("org_id", ctx.org.id)
      .maybeSingle();
    if (mem?.user_id) {
      const techErr = await ensureTechnician(ctx.supabase, ctx.org.id, mem.user_id);
      if (techErr)
        return fail("บันทึกบทบาทแล้ว แต่เพิ่มเข้าทะเบียนช่างไม่สำเร็จ: " + techErr);
    }
  }

  revalidatePath("/users");
  revalidatePath("/technicians");
  return ok();
}

/** Admin creates a user directly with an initial password (username or email). */
export async function createUser(input: {
  username: string;
  fullName: string;
  password: string;
  appRole: string;
  department: string;
}): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (error) return fail(error);

  if (!isValidLoginId(input.username))
    return fail("ชื่อผู้ใช้ไม่ถูกต้อง (ใช้ตัวอักษร/ตัวเลข . _ - อย่างน้อย 2 ตัว หรือกรอกอีเมล)");
  const email = toAuthEmail(input.username);
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
    const { error: flagErr } = await admin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", data.user.id);
    if (flagErr) {
      revalidatePath("/users");
      return fail(
        "สร้างผู้ใช้สำเร็จ แต่ตั้งค่าบังคับเปลี่ยนรหัสผ่านไม่สำเร็จ: " + flagErr.message
      );
    }
    // A Technician user also joins the technician roster.
    if (role === "Technician") {
      const techErr = await ensureTechnician(ctx.supabase, ctx.org.id, data.user.id);
      if (techErr) {
        revalidatePath("/users");
        return fail("สร้างผู้ใช้สำเร็จ แต่เพิ่มเข้าทะเบียนช่างไม่สำเร็จ: " + techErr);
      }
    }
  }
  revalidatePath("/users");
  revalidatePath("/technicians");
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
  const { error: flagErr } = await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", mem.user_id);
  revalidatePath("/users");
  if (flagErr)
    return fail(
      "เปลี่ยนรหัสผ่านแล้ว แต่ตั้งค่าบังคับเปลี่ยนรหัสผ่านไม่สำเร็จ: " + flagErr.message
    );
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
