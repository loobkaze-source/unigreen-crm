"use server";

import { getSessionContext } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { type ActionResult, ok, fail } from "@/lib/action-result";

/** The signed-in user chooses a new password, clearing the must-change flag. */
export async function forceSetPassword(newPassword: string): Promise<ActionResult> {
  const { userId } = await getSessionContext();
  if (!userId) return fail("ไม่พบผู้ใช้");
  if ((newPassword || "").length < 6)
    return fail("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
  if (newPassword === "123456")
    return fail("กรุณาตั้งรหัสใหม่ที่ไม่ใช่รหัสชั่วคราว");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return fail(error.message);

  const { error: e2 } = await supabase.rpc("mark_password_changed");
  if (e2) return fail(e2.message);
  return ok();
}
