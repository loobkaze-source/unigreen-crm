"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import { ASSET_STATUSES, type AssetStatus } from "@/lib/asset-status";

/**
 * Manual status override from the asset lifetime page. admin/Dispatcher may
 * override; retiring (or un-retiring) an asset is admin-only.
 */
export async function updateAssetStatus(
  equipmentId: string,
  status: AssetStatus
): Promise<ActionResult> {
  const ctx = await getSessionContext();
  const { supabase, org, isAdmin, appRole } = ctx;

  if (!ASSET_STATUSES.some((s) => s.value === status))
    return fail("สถานะไม่ถูกต้อง");
  if (!isAdmin && appRole !== "Dispatcher")
    return fail("เฉพาะ Dispatcher หรือแอดมินเท่านั้นที่ปรับสถานะเครื่องได้");

  if (!isAdmin) {
    if (status === "retired") return fail("การปลดระวางทำได้เฉพาะแอดมิน");
    const { data: current } = await supabase
      .from("equipment")
      .select("status")
      .eq("id", equipmentId)
      .eq("org_id", org.id)
      .maybeSingle();
    if (current?.status === "retired")
      return fail("เครื่องถูกปลดระวางแล้ว — แก้ได้เฉพาะแอดมิน");
  }

  const { error } = await supabase
    .from("equipment")
    .update({ status })
    .eq("id", equipmentId)
    .eq("org_id", org.id);
  if (error) return fail(error.message);

  revalidatePath("/assets");
  revalidatePath(`/assets/${equipmentId}`);
  return ok();
}
