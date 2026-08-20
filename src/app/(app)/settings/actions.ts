"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import { boardsFor } from "@/lib/departments";

async function requireAdmin() {
  const ctx = await getSessionContext();
  if (!ctx.isAdmin) return { ctx, error: "เฉพาะแอดมินเท่านั้น" as const };
  return { ctx, error: null };
}

export async function assignToBoard(input: {
  boardType: "pipeline" | "service";
  boardKey: string;
  userId: string;
}): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (error) return fail(error);
  // Each kind of board has its own list; a sales board is not a service one.
  if (!boardsFor(input.boardType).some((d) => d.value === input.boardKey))
    return fail("บอร์ดไม่ถูกต้อง");

  // The target must actually be a member of this org — an arbitrary UUID
  // would hand board visibility to a user from another workspace.
  const { data: member, error: mErr } = await ctx.supabase
    .from("organization_members")
    .select("id")
    .eq("org_id", ctx.org.id)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (mErr) return fail(mErr.message);
  if (!member) return fail("ผู้ใช้นี้ไม่ได้เป็นสมาชิกขององค์กร");

  const { error: e } = await ctx.supabase.from("board_assignments").upsert(
    {
      org_id: ctx.org.id,
      board_type: input.boardType,
      board_key: input.boardKey,
      user_id: input.userId,
    },
    { onConflict: "org_id,board_type,board_key,user_id" }
  );
  if (e) return fail(e.message);
  revalidatePath("/settings/pipelines");
  revalidatePath("/settings/service-boards");
  return ok();
}

export async function unassignFromBoard(assignmentId: string): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (error) return fail(error);
  const { error: e } = await ctx.supabase
    .from("board_assignments")
    .delete()
    .eq("id", assignmentId)
    .eq("org_id", ctx.org.id);
  if (e) return fail(e.message);
  revalidatePath("/settings/pipelines");
  revalidatePath("/settings/service-boards");
  return ok();
}
