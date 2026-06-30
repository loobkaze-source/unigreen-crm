"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";

export type CompanyInput = {
  id?: string;
  name: string;
  industry?: string;
  website?: string;
  phone?: string;
  address?: string;
  notes?: string;
};

export async function saveCompany(input: CompanyInput): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const name = input.name?.trim();
  if (!name) return fail("กรุณากรอกชื่อบริษัท");

  const payload = {
    org_id: org.id,
    name,
    industry: input.industry?.trim() || null,
    website: input.website?.trim() || null,
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    notes: input.notes?.trim() || null,
  };

  if (input.id) {
    const { error } = await supabase
      .from("companies")
      .update(payload)
      .eq("id", input.id);
    if (error) return fail(error.message);
  } else {
    const { error } = await supabase.from("companies").insert(payload);
    if (error) return fail(error.message);
  }

  revalidatePath("/companies");
  return ok();
}

export async function deleteCompany(id: string): Promise<ActionResult> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/companies");
  return ok();
}
