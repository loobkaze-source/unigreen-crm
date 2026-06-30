"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import type { EquipmentCategory } from "@/lib/database.types";

export type SiteInput = {
  id?: string;
  name: string;
  company_id?: string | null;
  address?: string;
  map_url?: string;
  contact_id?: string | null;
  notes?: string;
};

export async function saveSite(input: SiteInput): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const name = input.name?.trim();
  if (!name) return fail("กรุณากรอกชื่อไซต์");

  const payload = {
    org_id: org.id,
    name,
    company_id: input.company_id || null,
    address: input.address?.trim() || null,
    map_url: input.map_url?.trim() || null,
    contact_id: input.contact_id || null,
    notes: input.notes?.trim() || null,
  };

  if (input.id) {
    const { error } = await supabase.from("sites").update(payload).eq("id", input.id);
    if (error) return fail(error.message);
    revalidatePath(`/sites/${input.id}`);
  } else {
    const { data, error } = await supabase
      .from("sites")
      .insert(payload)
      .select("id")
      .single();
    if (error) return fail(error.message);
    revalidatePath("/sites");
    return ok(data.id);
  }

  revalidatePath("/sites");
  return ok(input.id);
}

export async function deleteSite(id: string): Promise<ActionResult> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.from("sites").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/sites");
  return ok();
}

export type EquipmentInput = {
  id?: string;
  site_id: string;
  name: string;
  category: EquipmentCategory;
  brand?: string;
  model?: string;
  serial_number?: string;
  install_date?: string | null;
  notes?: string;
};

export async function saveEquipment(input: EquipmentInput): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const name = input.name?.trim();
  if (!name) return fail("กรุณากรอกชื่ออุปกรณ์");

  const payload = {
    org_id: org.id,
    site_id: input.site_id,
    name,
    category: input.category || "other",
    brand: input.brand?.trim() || null,
    model: input.model?.trim() || null,
    serial_number: input.serial_number?.trim() || null,
    install_date: input.install_date || null,
    notes: input.notes?.trim() || null,
  };

  if (input.id) {
    const { error } = await supabase
      .from("equipment")
      .update(payload)
      .eq("id", input.id);
    if (error) return fail(error.message);
  } else {
    const { error } = await supabase.from("equipment").insert(payload);
    if (error) return fail(error.message);
  }

  revalidatePath(`/sites/${input.site_id}`);
  return ok();
}

export async function deleteEquipment(
  id: string,
  siteId: string
): Promise<ActionResult> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.from("equipment").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath(`/sites/${siteId}`);
  return ok();
}
