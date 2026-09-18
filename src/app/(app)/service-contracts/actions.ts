"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/data";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import type { ServiceType, VisitStatus } from "@/lib/database.types";
import { SERVICE_BOARDS } from "@/lib/departments";

export type ContractInput = {
  id?: string;
  title: string;
  company_id?: string | null;
  site_id?: string | null;
  service_type: ServiceType;
  start_date: string;
  /** When round 1 is due. Every later round is counted from here. */
  first_visit_date?: string | null;
  frequency_per_year: number | string;
  duration_years: number | string;
  technician_id?: string | null;
  board_key?: string | null;
  notes?: string;
};

const isBoard = (v: string | null | undefined) =>
  v && SERVICE_BOARDS.some((d) => d.value === v) ? v : null;

function num(v: number | string, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// All date arithmetic stays in UTC: ymd() reads back via toISOString (UTC),
// so mixing in local-time setMonth would shift a day across the boundary.
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** input.start_date as a UTC date-only Date; falls back to today in Thailand
 *  (the server clock is UTC — its "today" is Bangkok's yesterday until 07:00). */
function contractStart(input: string | undefined): Date | null {
  if (input) {
    const d = new Date(input.slice(0, 10) + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : d;
  }
  const bkk = new Date(Date.now() + 7 * 3600_000);
  return new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate()));
}

/** A round as the log records it. */
type LoggedRound = { seq: number; due_date: string };
type PlanSnapshot = {
  first_visit_date: string | null;
  frequency_per_year: number;
  rounds: LoggedRound[];
};

type Db = Awaited<ReturnType<typeof getSessionContext>>["supabase"];

/** The plan as it stands: every round of the contract, in order. */
async function readPlan(supabase: Db, orgId: string, contractId: string): Promise<PlanSnapshot> {
  const [{ data: c }, { data: rounds }] = await Promise.all([
    supabase
      .from("service_contracts")
      .select("first_visit_date, frequency_per_year")
      .eq("id", contractId)
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase
      .from("service_visits")
      .select("seq, due_date")
      .eq("contract_id", contractId)
      .eq("org_id", orgId)
      .order("seq"),
  ]);
  return {
    first_visit_date: (c?.first_visit_date as string | null) ?? null,
    frequency_per_year: Number(c?.frequency_per_year ?? 0),
    rounds: ((rounds ?? []) as LoggedRound[]).map((r) => ({ seq: r.seq, due_date: r.due_date })),
  };
}

/**
 * One line in the contract's history. Written after the change it describes,
 * and never allowed to fail the change: a plan that moved but was not written
 * down is a smaller problem than a plan that refused to move.
 */
async function logSchedule(
  supabase: Db,
  orgId: string,
  userId: string,
  contractId: string,
  action: "planned" | "rescheduled" | "moved",
  before: unknown,
  after: unknown,
  note?: string | null
) {
  await supabase.from("service_schedule_log").insert({
    org_id: orgId,
    contract_id: contractId,
    changed_by: userId,
    action,
    before: before ?? null,
    after,
    note: note?.trim() || null,
  });
}

export async function saveContract(input: ContractInput): Promise<ActionResult> {
  const { supabase, org, userId } = await getSessionContext();
  const title = input.title?.trim();
  if (!title) return fail("กรุณากรอกชื่อสัญญา");

  const freq = num(input.frequency_per_year, 2);
  const years = num(input.duration_years, 5);
  const start = contractStart(input.start_date);
  if (!start) return fail("วันที่เริ่มไม่ถูกต้อง");
  // Asked for, not assumed: nobody cleans the panels on the day the paperwork
  // is signed. The rounds are counted from this, not from the start date.
  if (!input.first_visit_date) return fail("กรุณาระบุวันที่เข้าบริการครั้งแรก");
  const firstVisit = contractStart(input.first_visit_date);
  if (!firstVisit) return fail("วันที่เข้าบริการครั้งแรกไม่ถูกต้อง");
  if (firstVisit < start) return fail("วันที่เข้าบริการครั้งแรกต้องไม่ก่อนวันที่เริ่มสัญญา");

  const payload = {
    org_id: org.id,
    title,
    company_id: input.company_id || null,
    site_id: input.site_id || null,
    service_type: input.service_type || "panel_cleaning",
    start_date: ymd(start),
    first_visit_date: ymd(firstVisit),
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
      .select("start_date, first_visit_date, frequency_per_year, duration_years")
      .eq("id", input.id)
      .eq("org_id", org.id)
      .maybeSingle();
    if (curErr) return fail(curErr.message);
    if (!current) return fail("ไม่พบสัญญา");

    const { error } = await supabase
      .from("service_contracts")
      .update(payload)
      .eq("id", input.id)
      .eq("org_id", org.id);
    if (error) return fail(error.message);

    // When the schedule inputs change, regenerate the plan: visits already
    // acted on (done/skipped) keep their seq; pending ones are replaced.
    const scheduleChanged =
      current.first_visit_date !== payload.first_visit_date ||
      Number(current.frequency_per_year) !== freq ||
      Number(current.duration_years) !== years;
    if (scheduleChanged) {
      const before = await readPlan(supabase, org.id, input.id);
      const { data: keptRows, error: keptErr } = await supabase
        .from("service_visits")
        .select("seq")
        .eq("org_id", org.id)
        .eq("contract_id", input.id)
        .neq("status", "pending");
      if (keptErr) return fail(keptErr.message);
      const keptSeqs = new Set((keptRows ?? []).map((r) => r.seq));

      const { error: delErr } = await supabase
        .from("service_visits")
        .delete()
        .eq("org_id", org.id)
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
        due_date: ymd(addMonths(firstVisit, i * interval)),
      })).filter((v) => !keptSeqs.has(v.seq));
      if (visits.length > 0) {
        const { error: insErr } = await supabase
          .from("service_visits")
          .insert(visits);
        if (insErr) return fail(insErr.message);
      }
      await logSchedule(
        supabase, org.id, userId, input.id, "rescheduled",
        before, await readPlan(supabase, org.id, input.id),
        "แก้ไขจากฟอร์มสัญญา"
      );
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
    due_date: ymd(addMonths(firstVisit, i * interval)),
  }));
  const { error: vErr } = await supabase.from("service_visits").insert(visits);
  if (vErr) {
    // Roll the contract back — leaving it standing with zero rounds means the
    // user's retry mints a duplicate while the first sits broken forever.
    await supabase
      .from("service_contracts")
      .delete()
      .eq("id", contract.id)
      .eq("org_id", org.id);
    return fail("สร้างรอบบริการไม่สำเร็จ: " + vErr.message + " — กรุณาลองใหม่");
  }
  await logSchedule(
    supabase, org.id, userId, contract.id, "planned",
    null,
    { first_visit_date: ymd(firstVisit), frequency_per_year: freq,
      rounds: visits.map((v) => ({ seq: v.seq, due_date: v.due_date })) }
  );

  revalidatePath("/service-contracts");
  revalidatePath("/service-board");
  return ok(contract.id);
}

export async function deleteContract(id: string): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  const { error } = await supabase
    .from("service_contracts")
    .delete()
    .eq("id", id)
    .eq("org_id", org.id);
  if (error) return fail(error.message);
  revalidatePath("/service-contracts");
  revalidatePath("/service-board");
  return ok();
}

/**
 * Moves one round to another day.
 *
 * The schedule is a plan, and the plan meets the customer's calendar: the
 * station is closed that week, the rains came, the crew is elsewhere. Only a
 * round still owed can move — one with a finished job on it happened when it
 * happened, and its date is a fact rather than a plan.
 */
export async function setVisitDueDate(
  visitId: string,
  contractId: string,
  dueDate: string,
  note?: string
): Promise<ActionResult> {
  const { supabase, org, userId } = await getSessionContext();
  const day = contractStart(dueDate);
  if (!dueDate || !day) return fail("วันที่ไม่ถูกต้อง");

  const { data: visit, error: vErr } = await supabase
    .from("service_visits")
    .select("id, seq, due_date, work_orders(status)")
    .eq("id", visitId)
    .eq("contract_id", contractId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (vErr) return fail(vErr.message);
  if (!visit) return fail("ไม่พบรอบบริการนี้ในสัญญา");
  // A to-one embed comes back as an object; the generated types say array.
  const raw = visit.work_orders as unknown as { status: string } | { status: string }[] | null;
  const job = Array.isArray(raw) ? raw[0] : raw;
  if (job?.status === "completed") return fail("รอบนี้เข้าบริการแล้ว เลื่อนวันไม่ได้");

  const { error } = await supabase
    .from("service_visits")
    .update({ due_date: ymd(day) })
    .eq("id", visitId)
    .eq("contract_id", contractId)
    .eq("org_id", org.id);
  if (error) return fail(error.message);
  await logSchedule(
    supabase, org.id, userId, contractId, "moved",
    { seq: visit.seq, due_date: visit.due_date },
    { seq: visit.seq, due_date: ymd(day) },
    note
  );

  revalidatePath(`/service-contracts/${contractId}`);
  revalidatePath("/service-contracts");
  revalidatePath("/service-board");
  return ok();
}

/**
 * Lays the rest of the plan out again from a date and a cadence.
 *
 * The rounds already served stay exactly where they are — they happened.
 * Every round still owed is thrown away and the remaining term is filled
 * again: the first on the day given, the rest every 12/frequency months, up
 * to the contract's end. So "quarterly from 1 November" is one action, not
 * eight date edits, and it reads as one line in the history.
 *
 * Seq carries on from the last served round, so a report number like
 * UNG-2024-0004-05 keeps meaning the fifth visit.
 */
export async function rescheduleContract(input: {
  contractId: string;
  from: string;
  frequency_per_year: number | string;
  note?: string;
}): Promise<ActionResult> {
  const { supabase, org, userId } = await getSessionContext();
  const from = contractStart(input.from);
  if (!input.from || !from) return fail("วันเริ่มรอบถัดไปไม่ถูกต้อง");
  const freq = num(input.frequency_per_year, 0);
  if (!freq) return fail("ความถี่ต้องมากกว่า 0");

  const { data: contract, error: cErr } = await supabase
    .from("service_contracts")
    .select("id, start_date, end_date, duration_years")
    .eq("id", input.contractId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (cErr) return fail(cErr.message);
  if (!contract) return fail("ไม่พบสัญญา");

  const end = contract.end_date
    ? contractStart(contract.end_date)!
    : addMonths(contractStart(contract.start_date)!, Math.round(Number(contract.duration_years) * 12));
  if (from > end) return fail("วันเริ่มรอบถัดไปอยู่หลังวันสิ้นสุดสัญญาแล้ว");

  const before = await readPlan(supabase, org.id, contract.id);

  // Served rounds are facts; everything else is the plan, and the plan is
  // about to be redrawn.
  const { data: rounds, error: rErr } = await supabase
    .from("service_visits")
    .select("id, seq, work_orders(status)")
    .eq("contract_id", contract.id)
    .eq("org_id", org.id)
    .order("seq");
  if (rErr) return fail(rErr.message);
  const isServed = (r: { work_orders: unknown }) => {
    const raw = r.work_orders as { status: string } | { status: string }[] | null;
    const job = Array.isArray(raw) ? raw[0] : raw;
    return job?.status === "completed";
  };
  const served = (rounds ?? []).filter(isServed);
  const owed = (rounds ?? []).filter((r) => !isServed(r));

  if (owed.length) {
    const { error: dErr } = await supabase
      .from("service_visits")
      .delete()
      .in("id", owed.map((r) => r.id));
    if (dErr) return fail(dErr.message);
  }

  const interval = Math.max(1, Math.round(12 / freq));
  const nextSeq = served.reduce((n, r) => Math.max(n, r.seq), 0) + 1;
  const fresh: { org_id: string; contract_id: string; seq: number; due_date: string }[] = [];
  for (let i = 0; ; i++) {
    const d = addMonths(from, i * interval);
    if (d > end) break;
    fresh.push({ org_id: org.id, contract_id: contract.id, seq: nextSeq + i, due_date: ymd(d) });
  }
  if (fresh.length) {
    const { error: iErr } = await supabase.from("service_visits").insert(fresh);
    if (iErr) return fail(iErr.message);
  }

  // The cadence is now the contract's; the anchor only if round 1 was redrawn.
  const patch: Record<string, unknown> = { frequency_per_year: freq };
  if (nextSeq === 1) patch.first_visit_date = ymd(from);
  const { error: uErr } = await supabase
    .from("service_contracts")
    .update(patch)
    .eq("id", contract.id)
    .eq("org_id", org.id);
  if (uErr) return fail(uErr.message);

  await logSchedule(
    supabase, org.id, userId, contract.id, "rescheduled",
    before, await readPlan(supabase, org.id, contract.id),
    input.note
  );

  revalidatePath(`/service-contracts/${contract.id}`);
  revalidatePath("/service-contracts");
  revalidatePath("/service-board");
  return ok(String(fresh.length));
}

export async function markVisit(
  visitId: string,
  status: VisitStatus,
  contractId: string
): Promise<ActionResult> {
  const { supabase, org } = await getSessionContext();
  // Scope by contract too — a mismatched (visit, contract) pair would update
  // one contract's round while refreshing a different contract's page.
  const { data: updated, error } = await supabase
    .from("service_visits")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", visitId)
    .eq("contract_id", contractId)
    .eq("org_id", org.id)
    .select("id");
  if (error) return fail(error.message);
  if (!updated?.length) return fail("ไม่พบรอบบริการนี้ในสัญญา");
  revalidatePath(`/service-contracts/${contractId}`);
  revalidatePath("/service-contracts");
  revalidatePath("/service-board");
  return ok();
}
