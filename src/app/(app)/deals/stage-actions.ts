"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import { DEPARTMENTS } from "@/lib/departments";
import type { Stage } from "@/lib/database.types";

const ADMIN_ONLY = "เฉพาะแอดมินเท่านั้นที่จัดการขั้นตอนไปป์ไลน์ได้";
const LOCKED = "Won / Missed เป็นขั้นตอนถาวร แก้ไขหรือลบไม่ได้";

/** Add a new (non-terminal) stage to a board, placed after the last open one. */
export async function createStage(
  boardKey: string,
  name: string
): Promise<ActionResult> {
  const { supabase, org, isAdmin } = await getSessionContext();
  if (!isAdmin) return fail(ADMIN_ONLY);
  const nm = name?.trim();
  if (!nm) return fail("กรุณากรอกชื่อขั้นตอน");
  if (!DEPARTMENTS.some((d) => d.value === boardKey)) return fail("บอร์ดไม่ถูกต้อง");

  // Position after the last *open* stage so it lands before Won/Missed.
  const { data: open } = await supabase
    .from("stages")
    .select("position")
    .eq("org_id", org.id)
    .eq("board_key", boardKey)
    .eq("is_won", false)
    .eq("is_lost", false)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((open?.position as number) ?? 0) + 1;

  const { error } = await supabase.from("stages").insert({
    org_id: org.id,
    board_key: boardKey,
    name: nm,
    position,
    is_won: false,
    is_lost: false,
    locked: false,
  });
  if (error) return fail(error.message);
  revalidatePath("/deals");
  return ok();
}

export async function renameStage(id: string, name: string): Promise<ActionResult> {
  const { supabase, org, isAdmin } = await getSessionContext();
  if (!isAdmin) return fail(ADMIN_ONLY);
  const nm = name?.trim();
  if (!nm) return fail("กรุณากรอกชื่อขั้นตอน");

  const { data: stage } = await supabase
    .from("stages")
    .select("locked")
    .eq("id", id)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!stage) return fail("ไม่พบขั้นตอน");
  if (stage.locked) return fail(LOCKED);

  const { error } = await supabase
    .from("stages")
    .update({ name: nm })
    .eq("id", id)
    .eq("org_id", org.id);
  if (error) return fail(error.message);
  revalidatePath("/deals");
  return ok();
}

export async function deleteStage(id: string): Promise<ActionResult> {
  const { supabase, org, isAdmin } = await getSessionContext();
  if (!isAdmin) return fail(ADMIN_ONLY);

  const { data: stage } = await supabase
    .from("stages")
    .select("locked")
    .eq("id", id)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!stage) return fail("ไม่พบขั้นตอน");
  if (stage.locked) return fail(LOCKED);

  // Don't orphan deals — require the column to be empty first.
  const { count } = await supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", id);
  if ((count ?? 0) > 0)
    return fail(`ลบไม่ได้ — ยังมี ${count} ดีลในขั้นตอนนี้ (ย้ายดีลออกก่อน)`);

  const { error } = await supabase
    .from("stages")
    .delete()
    .eq("id", id)
    .eq("org_id", org.id);
  if (error) return fail(error.message);
  revalidatePath("/deals");
  return ok();
}

/** Swap an open stage with its open neighbour to reorder a board. */
export async function moveStage(
  id: string,
  dir: "left" | "right"
): Promise<ActionResult> {
  const { supabase, org, isAdmin } = await getSessionContext();
  if (!isAdmin) return fail(ADMIN_ONLY);

  const { data: self } = await supabase
    .from("stages")
    .select("id, board_key, position, is_won, is_lost, locked")
    .eq("id", id)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!self) return fail("ไม่พบขั้นตอน");
  const s = self as Pick<Stage, "id" | "board_key" | "position" | "is_won" | "is_lost" | "locked">;
  if (s.locked || s.is_won || s.is_lost) return fail("ขั้นตอนนี้สลับลำดับไม่ได้");

  // Open stages of this board, in order.
  const { data: siblings } = await supabase
    .from("stages")
    .select("id, position")
    .eq("org_id", org.id)
    .eq("board_key", s.board_key)
    .eq("is_won", false)
    .eq("is_lost", false)
    .order("position", { ascending: true });
  const list = siblings ?? [];
  const idx = list.findIndex((x) => x.id === id);
  const swapIdx = dir === "left" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return ok(); // at the edge

  const a = list[idx];
  const b = list[swapIdx];
  // Swap their positions (two writes).
  const r1 = await supabase
    .from("stages")
    .update({ position: b.position })
    .eq("id", a.id)
    .eq("org_id", org.id);
  if (r1.error) return fail(r1.error.message);
  const r2 = await supabase
    .from("stages")
    .update({ position: a.position })
    .eq("id", b.id)
    .eq("org_id", org.id);
  if (r2.error) return fail(r2.error.message);
  revalidatePath("/deals");
  return ok();
}
