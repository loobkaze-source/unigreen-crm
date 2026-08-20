"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import { DEPARTMENTS } from "@/lib/departments";
import { USER_ROLES, primaryRole, isDeptScoped } from "@/lib/roles";
import { toAuthEmail, isValidLoginId, displayUsername, USERNAME_DOMAIN } from "@/lib/username";

const isRole = (v: string) =>
  USER_ROLES.includes(v as (typeof USER_ROLES)[number]) ? v : null;
/** Keep only known roles, de-duplicated and in USER_ROLES order. */
const cleanRoles = (v: readonly string[] | undefined) => {
  const set = new Set((v ?? []).filter((r): r is string => Boolean(isRole(r))));
  return USER_ROLES.filter((r) => set.has(r)) as string[];
};
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
  appRoles: string[],
  department: string
): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (error) return fail(error);
  const roles = cleanRoles(appRoles);
  if (roles.length === 0) return fail("กรุณาเลือกบทบาทอย่างน้อย 1 อย่าง");
  const primary = primaryRole(roles);
  const membershipRole = primary === "admin" ? "admin" : "member";
  // .select() returns the touched rows, so an update that matched nothing
  // (wrong id, or the owner shielded by .neq) is reported instead of being
  // silently claimed as success. It also hands back user_id for the
  // technician-roster step without a second lookup.
  const { data: updated, error: e } = await ctx.supabase
    .from("organization_members")
    .update({
      app_roles: roles,
      app_role: primary,
      // Admins see every department; otherwise a department only applies when
      // one of the held roles is department-scoped.
      department: primary === "admin" || !isDeptScoped(roles) ? null : isDept(department),
      role: membershipRole,
    })
    .eq("id", memberId)
    .eq("org_id", ctx.org.id)
    .neq("role", "owner")
    .select("user_id");
  if (e) return fail(e.message);
  if (!updated?.length)
    return fail("ไม่พบสมาชิก หรือเป็นเจ้าของระบบ (แก้ไขบทบาทเจ้าของไม่ได้)");

  const memberUserId = updated[0].user_id as string | null;
  if (roles.includes("Technician") && memberUserId) {
    const techErr = await ensureTechnician(ctx.supabase, ctx.org.id, memberUserId);
    if (techErr)
      return fail("บันทึกบทบาทแล้ว แต่เพิ่มเข้าทะเบียนช่างไม่สำเร็จ: " + techErr);
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
  appRoles: string[];
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

  const roles = cleanRoles(input.appRoles);
  if (roles.length === 0) return fail("กรุณาเลือกบทบาทอย่างน้อย 1 อย่าง");
  const role = primaryRole(roles);
  const department =
    role === "admin" || !isDeptScoped(roles) ? null : isDept(input.department);

  // Pre-create an invite so the signup trigger routes the new account into this
  // org with the right roles/department (and satisfies invite-only signup).
  // Remember what was there so a failed create restores it instead of
  // destroying a pending invite someone else set up.
  const { data: prevInvite, error: prevErr } = await ctx.supabase
    .from("invites")
    .select("app_role, app_roles, department")
    .eq("org_id", ctx.org.id)
    .eq("email", email)
    .maybeSingle();
  if (prevErr) return fail(prevErr.message);
  const { error: invErr } = await ctx.supabase.from("invites").upsert(
    { org_id: ctx.org.id, email, app_role: role, app_roles: roles, department },
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
    if (prevInvite) {
      await ctx.supabase.from("invites").upsert(
        { org_id: ctx.org.id, email, ...prevInvite },
        { onConflict: "org_id,email" }
      );
    } else {
      await ctx.supabase.from("invites").delete().eq("org_id", ctx.org.id).eq("email", email);
    }
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
  } else {
    // No error but no user either — the account state is unknown, and the
    // must-change-password flag was never set. Don't report success.
    revalidatePath("/users");
    return fail("สร้างผู้ใช้ไม่สำเร็จ (ระบบไม่ส่งข้อมูลบัญชีกลับมา) — ลองใหม่อีกครั้ง");
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

  // The owner's password cannot be reset by an admin — that would let any
  // admin take over the owner's account through the service-role client.
  const { data: mem, error: memErr } = await ctx.supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("id", memberId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (memErr) return fail(memErr.message);
  if (!mem?.user_id) return fail("ไม่พบสมาชิก");
  if (mem.role === "owner")
    return fail("รีเซ็ตรหัสผ่านของเจ้าของระบบไม่ได้ — เจ้าของต้องเปลี่ยนเองที่หน้า Account");

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
  const { data: removed, error: e } = await ctx.supabase
    .from("organization_members")
    .delete()
    .eq("id", memberId)
    .eq("org_id", ctx.org.id)
    .neq("role", "owner")
    .select("id");
  if (e) return fail(e.message);
  if (!removed?.length)
    return fail("ไม่พบสมาชิก หรือเป็นเจ้าของระบบ (นำเจ้าของออกไม่ได้)");
  revalidatePath("/users");
  revalidatePath("/technicians");
  return ok();
}
