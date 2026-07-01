"use server";

import { getSessionContext } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { type ActionResult, ok, fail } from "@/lib/action-result";

/** Change the signed-in user's own password (re-verifies the current one). */
export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ActionResult> {
  const { email } = await getSessionContext();
  if (!email) return fail("ไม่พบผู้ใช้");
  if (input.newPassword.length < 6)
    return fail("รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร");

  const supabase = await createClient();

  // Re-verify the current password before allowing the change.
  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email,
    password: input.currentPassword,
  });
  if (verifyErr) return fail("รหัสผ่านปัจจุบันไม่ถูกต้อง");

  const { error } = await supabase.auth.updateUser({
    password: input.newPassword,
  });
  if (error) return fail(error.message);
  return ok();
}
