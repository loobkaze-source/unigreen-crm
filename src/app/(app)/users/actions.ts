"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";

export const USER_ROLES = [
  "admin",
  "Sales",
  "Manager",
  "Technician",
  "Job Dispatcher",
  "Accounting",
] as const;

export async function updateMemberRole(
  memberId: string,
  appRole: string
): Promise<ActionResult> {
  const { supabase } = await getSessionContext();
  const role = USER_ROLES.includes(appRole as (typeof USER_ROLES)[number])
    ? appRole
    : null;
  const { error } = await supabase
    .from("organization_members")
    .update({ app_role: role })
    .eq("id", memberId);
  if (error) return fail(error.message);
  revalidatePath("/users");
  return ok();
}
