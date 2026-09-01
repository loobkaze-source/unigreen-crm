/**
 * Records the service rounds Unigreen has already been out for.
 *
 *   node scripts/close-ung-rounds.mjs
 *   node scripts/close-ung-rounds.mjs --apply
 *
 * Every UNG round that has come due has been served — "ยูนิกรีนได้เข้าบริการ
 * ตามกำหนดการครบทุกครั้ง" — but ninety-odd of them have no job to show for it,
 * so the board reads them as owed and has done since 2022.
 *
 * A round is served when its job is finished (0048), so the way to say it has
 * been served is to write the job: back-dated to the due date, completed, and
 * linked to the round, which is also what stamps its UNG-2024-0004-01 number.
 *
 * Only rounds that have come due. A round due next year has not been served
 * yet and saying so would be a lie the contract page would then repeat.
 *
 * Dry by default; --apply writes.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const env = Object.fromEntries(
  readFileSync("c:/CRM/.env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** PostgREST caps a response at 1,000 rows and says nothing about it. */
async function all(query) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

const today = new Date().toISOString().slice(0, 10);

const contracts = await all(() =>
  sb
    .from("service_contracts")
    .select("id, org_id, contract_no, title, company_id, site_id, technician_id")
    .like("contract_no", "UNG-%")
);
const byId = new Map(contracts.map((c) => [c.id, c]));

const visits = await all(() =>
  sb
    .from("service_visits")
    .select("id, contract_id, seq, due_date, status, work_order_id")
    .is("work_order_id", null)
    .lte("due_date", today)
    .order("due_date")
);
const owed = visits.filter((v) => byId.has(v.contract_id) && v.status === "pending");

console.log(`\nสัญญา UNG ${contracts.length} ฉบับ`);
console.log(`รอบที่ครบกำหนดแล้วแต่ยังไม่มีใบงาน: ${owed.length} รอบ`);
if (owed.length) {
  console.log(`ตั้งแต่ ${owed[0].due_date} ถึง ${owed[owed.length - 1].due_date}`);
  const perContract = new Map();
  for (const v of owed) perContract.set(v.contract_id, (perContract.get(v.contract_id) ?? 0) + 1);
  for (const [id, n] of perContract)
    console.log(`  ${byId.get(id).contract_no ?? "—"}  ${n} รอบ  ·  ${byId.get(id).title}`);
}

if (!APPLY) {
  console.log("\n(ทดลองรัน — ใส่ --apply เพื่อบันทึกจริง)");
} else {
  let made = 0;
  for (const v of owed) {
    const c = byId.get(v.contract_id);
    // 09:00 to 12:00 Bangkok on the day it was due, matching the rounds the
    // Aftersales import already wrote.
    const start = `${v.due_date}T02:00:00Z`;
    const done = `${v.due_date}T05:00:00Z`;

    const { data: wo, error } = await sb
      .from("work_orders")
      .insert({
        org_id: c.org_id,
        title: `ล้างแผงโซลาร์ ครั้งที่ ${v.seq}`,
        type: "electrical",
        job_class: "PM",
        board_key: "UNG",
        status: "completed",
        priority: "normal",
        company_id: c.company_id,
        site_id: c.site_id,
        technician_id: c.technician_id,
        contract_id: c.id,
        scheduled_start: start,
        completed_at: done,
        description: "บันทึกย้อนหลัง — เข้าบริการตามกำหนดการของสัญญา",
      })
      .select("id")
      .single();
    if (error) {
      console.error(`  x ${c.contract_no} รอบ ${v.seq}: ${error.message}`);
      continue;
    }

    // Linking is what makes the round served, and what stamps the job's number.
    const { error: vErr } = await sb
      .from("service_visits")
      .update({ work_order_id: wo.id, status: "done" })
      .eq("id", v.id);
    if (vErr) {
      console.error(`  x ผูกรอบ ${c.contract_no}-${v.seq} ไม่สำเร็จ: ${vErr.message}`);
      continue;
    }
    made++;
  }
  console.log(`\nสร้างใบงานย้อนหลัง ${made} ใบ`);
}
