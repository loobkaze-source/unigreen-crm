"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import type { AssetType, EquipmentCategory } from "@/lib/database.types";

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

// ---- Asset groups (named, per-site) ---------------------------------------
export type AssetGroupInput = { id?: string; site_id: string; name: string };

export async function saveAssetGroup(input: AssetGroupInput): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const name = input.name?.trim();
  if (!name) return fail("กรุณาตั้งชื่อกลุ่ม");

  if (input.id) {
    const { error } = await supabase
      .from("asset_groups")
      .update({ name })
      .eq("id", input.id)
      .eq("org_id", org.id);
    if (error) return fail(error.message);
  } else {
    const { error } = await supabase
      .from("asset_groups")
      .insert({ org_id: org.id, site_id: input.site_id, name });
    if (error) return fail(error.message);
  }
  revalidatePath(`/sites/${input.site_id}`);
  return ok();
}

export async function deleteAssetGroup(id: string, siteId: string): Promise<ActionResult> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.from("asset_groups").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath(`/sites/${siteId}`);
  return ok();
}

export type EquipmentInput = {
  id?: string;
  site_id: string;
  name: string;
  asset_type: AssetType;
  category: EquipmentCategory;
  brand?: string;
  model?: string;
  serial_number?: string;
  project_number?: string;
  group_id?: string | null;
  warranty_months?: number | null;
  warranty_start?: string | null;
  install_date?: string | null;
  notes?: string;
};

export async function saveEquipment(input: EquipmentInput): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const name = input.name?.trim();
  if (!name) return fail("กรุณากรอกชื่อ Asset");

  // A group can only hold assets from its own site.
  let group_id = input.group_id || null;
  if (group_id) {
    const { data: g } = await supabase
      .from("asset_groups")
      .select("site_id")
      .eq("id", group_id)
      .maybeSingle();
    if (!g || g.site_id !== input.site_id) group_id = null;
  }

  const isProject = input.asset_type === "project";
  const payload = {
    org_id: org.id,
    site_id: input.site_id,
    group_id,
    name,
    asset_type: isProject ? "project" : "object",
    category: input.category || "other",
    brand: input.brand?.trim() || null,
    model: input.model?.trim() || null,
    serial_number: isProject ? null : input.serial_number?.trim() || null,
    project_number: isProject ? input.project_number?.trim() || null : null,
    warranty_months:
      input.warranty_months == null || Number.isNaN(input.warranty_months)
        ? null
        : Math.max(0, Math.round(input.warranty_months)),
    warranty_start: input.warranty_start || null,
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
