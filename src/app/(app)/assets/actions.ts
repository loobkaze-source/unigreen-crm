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
  const { supabase, org, isAdmin, appRoles } = ctx;

  if (!ASSET_STATUSES.some((s) => s.value === status))
    return fail("สถานะไม่ถูกต้อง");
  if (!isAdmin && !appRoles.includes("Dispatcher"))
    return fail("เฉพาะ Dispatcher หรือแอดมินเท่านั้นที่ปรับสถานะเครื่องได้");

  if (!isAdmin) {
    if (status === "retired") return fail("การปลดระวางทำได้เฉพาะแอดมิน");
    // A failed read must not slip past the retired check.
    const { data: current, error: curErr } = await supabase
      .from("equipment")
      .select("status")
      .eq("id", equipmentId)
      .eq("org_id", org.id)
      .maybeSingle();
    if (curErr) return fail(curErr.message);
    if (current?.status === "retired")
      return fail("เครื่องถูกปลดระวางแล้ว — แก้ได้เฉพาะแอดมิน");
  }

  const { data: updated, error } = await supabase
    .from("equipment")
    .update({ status })
    .eq("id", equipmentId)
    .eq("org_id", org.id)
    .select("site_id");
  if (error) return fail(error.message);
  if (!updated?.length) return fail("ไม่พบ Asset นี้ในองค์กรของคุณ");

  revalidatePath("/assets");
  revalidatePath(`/assets/${equipmentId}`);
  // The site page shows this asset's status too.
  if (updated[0].site_id) revalidatePath(`/sites/${updated[0].site_id}`);
  return ok();
}
