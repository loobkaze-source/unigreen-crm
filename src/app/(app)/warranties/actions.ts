"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import type { WarrantyKind, WarrantyStatus } from "@/lib/database.types";

export type WarrantyInput = {
  id?: string;
  kind: WarrantyKind;
  title: string;
  company_id?: string | null;
  site_id?: string | null;
  equipment_id?: string | null;
  serial_number?: string;
  provider?: string;
  start_date?: string | null;
  end_date?: string | null;
  terms?: string;
  status?: WarrantyStatus;
};

export async function saveWarranty(input: WarrantyInput): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const title = input.title?.trim();
  if (!title) return fail("กรุณากรอกชื่อ/รายละเอียดการรับประกัน");

  const payload = {
    org_id: org.id,
    kind: input.kind || "project",
    title,
    company_id: input.company_id || null,
    site_id: input.site_id || null,
    equipment_id: input.equipment_id || null,
    serial_number: input.serial_number?.trim() || null,
    provider: input.provider?.trim() || null,
    start_date: input.start_date || null,
    end_date: input.end_date || null,
    terms: input.terms?.trim() || null,
    status: input.status || "active",
  };

  if (input.id) {
    const { error } = await supabase
      .from("warranties")
      .update(payload)
      .eq("id", input.id);
    if (error) return fail(error.message);
  } else {
    const { error } = await supabase.from("warranties").insert(payload);
    if (error) return fail(error.message);
  }

  revalidatePath("/warranties");
  return ok();
}

export async function deleteWarranty(id: string): Promise<ActionResult> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.from("warranties").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/warranties");
  return ok();
}
