"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import { DEPARTMENTS } from "@/lib/departments";

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
  if (!DEPARTMENTS.some((d) => d.value === input.boardKey))
    return fail("บอร์ดไม่ถูกต้อง");

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
