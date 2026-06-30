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
  const { supabase, org } = await getSessionContext();

  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();
  if (leadErr || !lead) return fail(leadErr?.message || "ไม่พบลูกค้ามุ่งหวัง");
  if (lead.status === "converted") return fail("ลูกค้ามุ่งหวังนี้ถูกแปลงแล้ว");

  // 1. Company (if a company name was provided)
  let companyId: string | null = null;
  if (lead.company_name) {
    const { data: company, error } = await supabase
      .from("companies")
      .insert({ org_id: org.id, name: lead.company_name })
      .select("id")
      .single();
    if (error) return fail(error.message);
    companyId = company.id;
  }

  // 2. Contact (split the lead name into first / last)
  const parts = lead.name.trim().split(/\s+/);
  const firstName = parts[0] || lead.name;
  const lastName = parts.slice(1).join(" ") || null;

  const { data: contact, error: contactErr } = await supabase
    .from("contacts")
    .insert({
      org_id: org.id,
      first_name: firstName,
      last_name: lastName,
      email: lead.email,
      phone: lead.phone,
      company_id: companyId,
    })
    .select("id")
    .single();
  if (contactErr) return fail(contactErr.message);

  // 3. Deal in the first stage
  const { data: stage } = await supabase
    .from("stages")
    .select("id")
    .eq("org_id", org.id)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!stage) return fail("ไม่พบขั้นตอนไปป์ไลน์ในพื้นที่ทำงานนี้");

  const dealTitle = lead.company_name
    ? `${lead.company_name} — ${lead.name}`
    : `${lead.name}`;

  const { data: deal, error: dealErr } = await supabase
    .from("deals")
    .insert({
      org_id: org.id,
      title: dealTitle,
      value: lead.value ?? 0,
      stage_id: stage.id,
      company_id: companyId,
      contact_id: contact.id,
    })
    .select("id")
    .single();
  if (dealErr) return fail(dealErr.message);

  // 4. Mark lead converted
  const { error: updErr } = await supabase
    .from("leads")
    .update({
      status: "converted",
      converted_contact_id: contact.id,
      converted_company_id: companyId,
      converted_deal_id: deal.id,
      converted_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updErr) return fail(updErr.message);

  revalidatePath("/leads");
  revalidatePath("/contacts");
  revalidatePath("/companies");
  revalidatePath("/deals");
  return ok(deal.id);
}
