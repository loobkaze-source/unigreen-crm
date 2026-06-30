"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";

export type ProductInput = {
  id?: string;
  sku?: string;
  name: string;
  description?: string;
  category?: string;
  barcode?: string;
  cost?: string | number | null;
  price?: string | number | null;
  unit?: string;
  quantity?: string | number | null;
  active?: boolean;
};

function num(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function saveProduct(input: ProductInput): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const name = input.name?.trim();
  if (!name) return fail("กรุณากรอกชื่อสินค้า");

  const payload = {
    org_id: org.id,
    sku: input.sku?.trim() || null,
    name,
    description: input.description?.trim() || null,
    category: input.category?.trim() || null,
    barcode: input.barcode?.trim() || null,
    cost: num(input.cost),
    price: num(input.price),
    unit: input.unit?.trim() || null,
    quantity: num(input.quantity),
    active: input.active ?? true,
  };

  if (input.id) {
    const { error } = await supabase.from("products").update(payload).eq("id", input.id);
    if (error) return fail(error.message);
  } else {
    const { error } = await supabase.from("products").insert(payload);
    if (error) return fail(error.message);
  }

  revalidatePath("/products");
  return ok();
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/products");
  return ok();
}
