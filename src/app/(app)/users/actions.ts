"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
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
  // Business "admin" also gets the membership-level admin that RLS enforces.
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
    .neq("role", "owner"); // never alter the workspace owner
  if (e) return fail(e.message);
  revalidatePath("/users");
  return ok();
}

export async function inviteMember(input: {
  email: string;
  appRole: string;
  department: string;
}): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (error) return fail(error);

  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) return fail("อีเมลไม่ถูกต้อง");

  // Already a member?
  const { data: existing } = await ctx.supabase
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (existing) {
    const { data: mem } = await ctx.supabase
      .from("organization_members")
      .select("id")
      .eq("org_id", ctx.org.id)
      .eq("user_id", existing.id)
      .maybeSingle();
    if (mem) return fail("ผู้ใช้นี้เป็นสมาชิกอยู่แล้ว");
    // Existing account (in another workspace) — add straight into this org.
    const role = isRole(input.appRole);
    const { error: e } = await ctx.supabase
      .from("organization_members")
      .insert({
        org_id: ctx.org.id,
        user_id: existing.id,
        role: role === "admin" ? "admin" : "member",
        app_role: role,
        department: role === "admin" ? null : isDept(input.department),
      });
    if (e) return fail(e.message);
    revalidatePath("/users");
    return ok();
  }

  const { error: e } = await ctx.supabase.from("invites").upsert(
    {
      org_id: ctx.org.id,
      email,
      app_role: isRole(input.appRole),
      department: isDept(input.department),
    },
    { onConflict: "org_id,email" }
  );
  if (e) return fail(e.message);
  revalidatePath("/users");
  return ok();
}

export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (error) return fail(error);
  const { error: e } = await ctx.supabase
    .from("invites")
    .delete()
    .eq("id", inviteId)
    .eq("org_id", ctx.org.id);
  if (e) return fail(e.message);
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
    .neq("role", "owner"); // never remove the workspace owner
  if (e) return fail(e.message);
  revalidatePath("/users");
  return ok();
}
