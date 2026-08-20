"use server";

import { getSessionContext } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import { isKnownAvatar } from "@/lib/avatars";
import { revalidatePath } from "next/cache";

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

/**
 * Picks one of the built-in avatars, or clears it back to initials.
 *
 * Only a path this app produced is accepted — the value ends up in an <img>
 * src on every page that shows the member, so it is not a free-text field
 * however harmless a URL looks.
 */
export async function saveAvatar(url: string | null): Promise<ActionResult> {
  const { supabase, userId } = await getSessionContext();
  if (url !== null && !isKnownAvatar(url)) return fail("รูปนี้ไม่อยู่ในชุดที่เลือกได้");

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", userId);
  if (error) return fail(error.message);
  revalidatePath("/account");
  revalidatePath("/users");
  return ok();
}
