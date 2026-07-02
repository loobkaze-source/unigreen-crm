"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import type { ServiceType, VisitStatus } from "@/lib/database.types";
import { DEPARTMENTS } from "@/lib/departments";

export type ContractInput = {
  id?: string;
  title: string;
  company_id?: string | null;
  site_id?: string | null;
  service_type: ServiceType;
  start_date: string;
  frequency_per_year: number | string;
  duration_years: number | string;
  technician_id?: string | null;
  board_key?: string | null;
  notes?: string;
};

const isBoard = (v: string | null | undefined) =>
  v && DEPARTMENTS.some((d) => d.value === v) ? v : null;

function num(v: number | string, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function saveContract(input: ContractInput): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const title = input.title?.trim();
  if (!title) return fail("กรุณากรอกชื่อสัญญา");

  const freq = num(input.frequency_per_year, 2);
  const years = num(input.duration_years, 5);
  const start = input.start_date ? new Date(input.start_date) : new Date();
  if (isNaN(start.getTime())) return fail("วันที่เริ่มไม่ถูกต้อง");

  const payload = {
    org_id: org.id,
    title,
    company_id: input.company_id || null,
    site_id: input.site_id || null,
    service_type: input.service_type || "panel_cleaning",
    start_date: ymd(start),
    frequency_per_year: freq,
    duration_years: years,
    end_date: ymd(addMonths(start, Math.round(years * 12))),
    technician_id: input.technician_id || null,
    board_key: isBoard(input.board_key),
    notes: input.notes?.trim() || null,
  };

  if (input.id) {
    const { data: current, error: curErr } = await supabase
      .from("service_contracts")
      .select("start_date, frequency_per_year, duration_years")
      .eq("id", input.id)
      .maybeSingle();
    if (curErr) return fail(curErr.message);
    if (!current) return fail("ไม่พบสัญญา");

    const { error } = await supabase
      .from("service_contracts")
      .update(payload)
      .eq("id", input.id);
    if (error) return fail(error.message);

    // When the schedule inputs change, regenerate the plan: visits already
    // acted on (done/skipped) keep their seq; pending ones are replaced.
    const scheduleChanged =
      current.start_date !== payload.start_date ||
      Number(current.frequency_per_year) !== freq ||
      Number(current.duration_years) !== years;
    if (scheduleChanged) {
      const { data: keptRows, error: keptErr } = await supabase
        .from("service_visits")
        .select("seq")
        .eq("contract_id", input.id)
        .neq("status", "pending");
      if (keptErr) return fail(keptErr.message);
      const keptSeqs = new Set((keptRows ?? []).map((r) => r.seq));

      const { error: delErr } = await supabase
        .from("service_visits")
        .delete()
        .eq("contract_id", input.id)
        .eq("status", "pending");
      if (delErr) return fail(delErr.message);

      const total = Math.max(1, Math.round(freq * years));
      const interval = Math.max(1, Math.round(12 / freq));
      // A failure after the delete leaves a shorter (re-editable) schedule,
      // never corrupted data — acceptable without a transaction at this scale.
      const visits = Array.from({ length: total }, (_, i) => ({
        org_id: org.id,
        contract_id: input.id as string,
        seq: i + 1,
        due_date: ymd(addMonths(start, i * interval)),
      })).filter((v) => !keptSeqs.has(v.seq));
      if (visits.length > 0) {
        const { error: insErr } = await supabase
          .from("service_visits")
          .insert(visits);
        if (insErr) return fail(insErr.message);
      }
    }

    revalidatePath(`/service-contracts/${input.id}`);
    revalidatePath("/service-contracts");
    return ok(input.id);
  }

  // Create the contract, then generate its scheduled visits.
  const { data: contract, error } = await supabase
    .from("service_contracts")
    .insert(payload)
    .select("id")
    .single();
  if (error) return fail(error.message);

  const total = Math.max(1, Math.round(freq * years));
  const interval = Math.max(1, Math.round(12 / freq));
  const visits = Array.from({ length: total }, (_, i) => ({
    org_id: org.id,
    contract_id: contract.id,
    seq: i + 1,
    due_date: ymd(addMonths(start, i * interval)),
  }));
  const { error: vErr } = await supabase.from("service_visits").insert(visits);
  if (vErr) return fail(vErr.message);

  revalidatePath("/service-contracts");
  return ok(contract.id);
}

export async function deleteContract(id: string): Promise<ActionResult> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.from("service_contracts").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/service-contracts");
  return ok();
}

export async function markVisit(
  visitId: string,
  status: VisitStatus,
  contractId: string
): Promise<ActionResult> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase
    .from("service_visits")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", visitId);
  if (error) return fail(error.message);
  revalidatePath(`/service-contracts/${contractId}`);
  revalidatePath("/service-contracts");
  return ok();
}
