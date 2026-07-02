"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import type { LeadStatus } from "@/lib/database.types";

export type LeadInput = {
  id?: string;
  name: string;
  company_name?: string;
  email?: string;
  phone?: string;
  source?: string;
  status?: LeadStatus;
  value?: string | number | null;
  notes?: string;
};

function parseValue(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function saveLead(input: LeadInput): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const name = input.name?.trim();
  if (!name) return fail("กรุณากรอกชื่อลูกค้ามุ่งหวัง");

  const payload = {
    org_id: org.id,
    name,
    company_name: input.company_name?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    source: input.source?.trim() || null,
    status: (input.status || "new") as LeadStatus,
    value: parseValue(input.value),
    notes: input.notes?.trim() || null,
  };

  if (input.id) {
    const { error } = await supabase
      .from("leads")
      .update(payload)
      .eq("id", input.id);
    if (error) return fail(error.message);
  } else {
    const { error } = await supabase.from("leads").insert(payload);
    if (error) return fail(error.message);
  }

  revalidatePath("/leads");
  return ok();
}

export async function deleteLead(id: string): Promise<ActionResult> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/leads");
  return ok();
}

/**
 * Converts a lead into a Company (optional), a Contact, and an open Deal
 * placed in the first pipeline stage, then marks the lead as converted.
 */
export async function convertLead(id: string): Promise<ActionResult> {
  const { supabase } = await getSessionContext();

  // Atomic: company + contact + deal + lead update happen in one transaction
  // inside the DB function (migration 0021) — no orphans on partial failure,
  // and a row lock prevents double conversion.
  const { data: dealId, error } = await supabase.rpc("convert_lead", {
    p_lead_id: id,
  });
  if (error) return fail(error.message);

  revalidatePath("/leads");
  revalidatePath("/contacts");
  revalidatePath("/companies");
  revalidatePath("/deals");
  return ok(dealId);
}
