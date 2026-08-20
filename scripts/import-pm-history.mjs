/**
 * Records the solar cleanings that have already happened, from the Aftersales
 * plan, as finished work orders against each contract's rounds.
 *
 *   node scripts/import-pm-history.mjs
 *   node scripts/import-pm-history.mjs --apply
 *
 * The PM List sheet is a plan that runs to 2030, so only the campaigns whose
 * period has already passed count as history; the rest is what is still owed.
 * A site's highest "ครั้งที่" across those is how many times it has been
 * cleaned, and on the owner's word that no cleaning has ever been missed, that
 * means rounds 1..N are all served.
 *
 * A site the CRM does not have is left alone — the Hoymiles customers are not
 * loaded yet, and inventing them here would be worse than the gap.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { readSheet } from "./xlsx-read.mjs";
import { S, colName, sheetXml, buildXlsx } from "./xlsx-write.mjs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const EXPORT = args.includes("--export");
const OUT = "import-data/pm-history-match.xlsx";
const FILE = args.find((a) => !a.startsWith("--")) ?? "import-data/Aftersales Plan UNG.xlsx";

/** Campaigns at or before this month have happened; later ones are the plan. */
const TODAY_MONTH = new Date().toISOString().slice(0, 7);

const s = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

/** "3.0" -> 3, "4/4 (ครบ)" -> 4, an Excel date serial -> null. */
const times = (v) => {
  const m = /^(\d{1,2})(?:\s*\/|\b)/.exec(s(v));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= 30 ? n : null;
};

// ---------------------------------------------------------------------------
//  ประวัติการล้างแผง
// ---------------------------------------------------------------------------
const history = new Map(); // site as written in the plan -> highest ครั้งที่

function note(site, n) {
  if (!site || n == null) return;
  history.set(site, Math.max(history.get(site) ?? 0, n));
}

const pm = readSheet(FILE, "PM List");
const periods = pm.rows[0].map(s);
const head = pm.rows[1].map(s);
const past = [];
head.forEach((h, i) => {
  if (h !== "Site") return;
  let label = "";
  for (let j = i; j >= 0 && !label; j--) label = periods[j];
  const m = /(\d{2})\s*\/\s*(\d{4})/.exec(label);
  const month = m ? `${m[2]}-${m[1]}` : null;
  if (month && month <= TODAY_MONTH) past.push({ i, label });
});
for (const r of pm.rows.slice(2)) for (const b of past) note(s(r[b.i]), times(r[b.i + 1]));

// The per-campaign sheets say outright whether the visit happened.
for (const name of pm.sheetNames.filter((n) => n.startsWith("ล้างแผง"))) {
  const sh = readSheet(FILE, name);
  const h = (sh.rows[1] ?? []).map(s);
  const iSite = h.indexOf("Site");
  const iTimes = h.indexOf("ครั้งที่");
  const iStatus = h.findIndex((x) => x.startsWith("สถานะงาน"));
  if (iSite < 0 || iTimes < 0) continue;
  for (const r of sh.rows.slice(2)) {
    if (iStatus >= 0 && !s(r[iStatus]).includes("เสร็จ")) continue;
    note(s(r[iSite]), times(r[iTimes]));
  }
}

// ---------------------------------------------------------------------------
//  จับคู่กับสัญญาในระบบ
// ---------------------------------------------------------------------------

/**
 * Both sides name the same station in their own way — "ปตท. วังมะนาว
 * (PTT&7-Eleven) (เฮียจรรยา)" against "บจ. ธนโชติชัยการปิโตรเลียม (PTT Station
 * วังมะนาว)" — so the match is on what is left after the words every station
 * shares. What remains is the place, and the place is what identifies it.
 */
const NOISE = [
  "ptt station", "pttor", "ptt", "7-eleven", "7-11", "7 eleven", "eleven",
  "amazon", "cafe", "café", "station", "petrol", "ev", "ngv", "gas",
  "ปตท.", "ปตท", "สาขา", "บจก.", "บจ.", "บริษัท", "หจก.", "ห้างหุ้นส่วน",
  "จำกัด", "สำนักงานใหญ่", "น้ำมัน", "ร้าน", "ปั๊ม", "ปั้ม", "บ้าน", "คุณ",
  "เฮีย", "เจ๊", "พี่", "จ.", "ต.", "อ.",
];

const fold = (v) =>
  s(v)
    .toLowerCase()
    .replace(/ํา/g, "ำ")
    .replace(/[()[\]{}]/g, " ")
    .replace(/[-_/+&,.']/g, " ");

function tokens(v) {
  let t = ` ${fold(v)} `;
  for (const n of NOISE) t = t.split(fold(n)).join(" ");
  return t.split(/\s+/).filter((w) => w.length >= 3);
}

/** How much of the place-name survives in both, longest word first. */
function score(a, b) {
  const A = tokens(a);
  const B = tokens(b).join(" ");
  let best = 0;
  for (const w of A) if (B.includes(w)) best = Math.max(best, w.length);
  return best;
}

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
const { data: orgs, error: orgErr } = await sb.from("organizations").select("id, name");
if (orgErr) throw new Error(`อ่าน organizations ไม่ได้: ${orgErr.message}`);
const ORG = orgs[0];

const { data: contracts, error: cErr } = await sb
  .from("service_contracts")
  .select("id, contract_no, title, site_id, company_id, board_key")
  .eq("org_id", ORG.id);
if (cErr) throw new Error(`อ่านสัญญาไม่ได้: ${cErr.message}`);

/** Paged: PostgREST caps a response at 1,000 and says nothing when it does. */
async function loadAll(table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from(table).select(columns).eq("org_id", ORG.id).range(from, from + 999);
    if (error) throw new Error(`อ่าน ${table} ไม่ได้: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

const sites = await loadAll("sites", "id, name");
const companies = await loadAll("companies", "id, name");
const siteName = new Map(sites.map((x) => [x.id, x.name]));
const coName = new Map(companies.map((x) => [x.id, x.name]));

const label = (c) =>
  `${siteName.get(c.site_id) ?? ""} ${coName.get(c.company_id) ?? ""}`;

/**
 * Rows the owner has ruled on, because the names alone could not.
 *
 * A row can name more than one contract: a station's forecourt and its 7-Eleven
 * are two agreements and one afternoon's work, and the plan writes them on one
 * line ("ปตท.ธนวิน 24 (PTT&7-Eleven)"). `null` means there is nothing here to
 * record against — the agreement ran out years ago, or the customer is one of
 * the Hoymiles sites not loaded yet.
 */
const BY_HAND = {
  "หอพัก PJ House พิษณุโลก": [null, "หมดสัญญาไปนานแล้ว"],
  "Café Amazon กันทรวิชัย (หจก.สารคามพัฒนาการก่อสร้าง)": [
    ["UNG-2025-0002"],
    "ลูกค้ายืนยัน: หจก.สารคามพัฒนาการก่อสร้าง",
  ],
  // Both agreements at one station, cleaned in one visit.
  "ปตท.ธนวิน 24 (PTT&7-Eleven) (เจ๊เมย)": [
    ["UNG-2022-0002", "UNG-2022-0003"],
    "ปั๊มและ 7-Eleven ของธนวิน 24",
  ],
  "ปตท. วังมะนาว (PTT&7-Eleven) (เฮียจรรยา)": [
    ["UNG-2023-0008", "UNG-2023-0009"],
    "ปั๊มและ 7-Eleven วังมะนาว — บ้านเฮียจรรยาเป็นอีกแถวหนึ่ง",
  ],
  "ปตท. เกษตรวิสัย (PTT & 7-Eleven) (คุณเอกวัฒน์)": [
    ["UNG-2024-0008", "UNG-2024-0009"],
    "ปั๊มและ 7-Eleven เกษตรวิสัย — เมืองเกษตรวิสัยเป็นอีกแถวหนึ่ง",
  ],
  "PTT Station ปตท.แยกเกษมพล (PTT & 7-Eleven) +บ้านคุณเล็กปั๊มแยกเกษมพล (บจ.ปทุมพฤกษรักษ์ ออยล์)": [
    ["UNG-2024-0018"],
    "แยกเกษมพล (บ้านคุณเล็ก) — UNG-2024-0017 เป็นพลูตาหลวง คนละสถานี",
  ],
  // The 7-Eleven is certain; which of the two หล่มสัก stations shares the row
  // is not, so only the certain half is recorded.
  "PTT ปตท.หล่มสัก + 7-Eleven สาขา น้ำชุน (หล่มสัก)": [
    ["UNG-2024-0015"],
    "7-Eleven น้ำชุน — ยังไม่ได้ตัดสินว่าปั๊มหล่มสักเป็น UNG-2024-0004 หรือ 0016",
  ],
  // Matched on a name the two happen to share, nothing more.
  "บ้านคุณธนกร life boulevard พระราม 2": [null, "ไม่มีในระบบ (คนละพระราม)"],
  "บ้านคุณดาว life boulevard พระราม 2": [null, "ไม่มีในระบบ (คนละพระราม)"],
  "บ้านคุณวีรชัย จ.ชลบุรี": [null, "ไม่มีในระบบ (ชนแค่ชื่อวีรชัย)"],
  "PTT Station ปตท.ยูพาร์ค (บจ.ดี เอนเนอร์จี แอนด์ รีเทล)": [null, "ไม่มีในระบบ"],
  "ปตท. กาฬสินธุ์ - สหัสขันธุ์ (PTT & 7-Eleven) (เจ๊เม่ย)": [null, "ไม่มีในระบบ (คนละสาขา)"],
};


/** The best contract for a plan row, and whether anything else came close. */
function match(planSite) {
  const ruled = BY_HAND[planSite];
  if (ruled) {
    const [nos, why] = ruled;
    if (!nos) return { cs: [], why: `ตรวจแล้ว: ${why}` };
    const cs = nos.map((no) => {
      const c = contracts.find((x) => x.contract_no === no);
      if (!c) throw new Error(`BY_HAND ชี้ไปที่สัญญา ${no} ซึ่งไม่มีในระบบ`);
      return c;
    });
    return { cs, why };
  }
  const ranked = contracts
    .map((c) => ({ c, n: score(planSite, label(c)) }))
    .filter((x) => x.n >= 4)
    .sort((a, b) => b.n - a.n);
  if (!ranked.length) return { cs: [], why: "ไม่พบสัญญาที่ตรง" };
  const [top, next] = ranked;
  // Two contracts equally close is a station with more than one agreement; the
  // plan row cannot say which, so it is left for someone who can.
  if (next && next.n === top.n) {
    return {
      cs: [],
      why: `ตรงเท่ากันหลายสัญญา (${ranked.filter((x) => x.n === top.n).map((x) => x.c.contract_no).join(", ")})`,
    };
  }
  return { cs: [top.c], n: top.n };
}

// ---------------------------------------------------------------------------

const plan = [...history.entries()].sort((a, b) => b[1] - a[1]);
const matched = [];
const skipped = [];
const used = new Map(); // contract id -> plan site, so two rows cannot claim one

for (const [site, done] of plan) {
  const { cs, why, n } = match(site);
  if (!cs.length) {
    skipped.push({ site, done, why });
    continue;
  }
  // One row can name a station's forecourt and its shop; each contract still
  // gets its own record of the visit.
  for (const c of cs) {
    if (used.has(c.id)) {
      skipped.push({ site, done, why: `สัญญา ${c.contract_no} ถูกจับคู่กับ “${used.get(c.id)}” ไปแล้ว` });
      continue;
    }
    used.set(c.id, site);
    matched.push({ site, done, c, n });
  }
}

console.log(`ไฟล์: ${FILE}`);
console.log(`รอบที่ผ่านมาแล้ว: ${past.map((b) => b.label).join(" · ")}`);
console.log(`ไซต์ในแผนที่มีประวัติล้าง ${plan.length} · จับคู่สัญญาได้ ${matched.length} · ข้าม ${skipped.length}`);
console.log(APPLY ? "โหมด: เขียนจริง\n" : "โหมด: ทดลอง — ใส่ --apply เพื่อเขียน\n");

console.log("จับคู่ได้:");
for (const m of matched.sort((a, b) => a.c.contract_no.localeCompare(b.c.contract_no))) {
  console.log(`   ${m.c.contract_no}  ล้างแล้ว ${m.done} ครั้ง`);
  console.log(`      แผน : ${m.site.slice(0, 62)}`);
  console.log(`      ระบบ: ${(siteName.get(m.c.site_id) ?? "—").slice(0, 62)}`);
}

console.log(`\nข้าม ${skipped.length} ไซต์ (ไม่มีในระบบ หรือชี้ได้หลายสัญญา):`);
skipped.forEach((x) => console.log(`   ${String(x.done).padStart(2)}  ${x.site.padEnd(54)} ${x.why}`));

// ---------------------------------------------------------------------------
//  แผ่นตรวจการจับคู่
// ---------------------------------------------------------------------------
/**
 * The names on the plan and the names in the CRM were written by different
 * people for different purposes, and a station with a shop, a forecourt and
 * the owner's house has three contracts and one row in the plan. Guessing
 * writes finished work orders against the wrong agreement, so the guess goes
 * out for checking rather than in.
 */
if (EXPORT) {
  const COLS = [
    { key: "ไซต์ในแผน", width: 52 },
    { key: "ล้างแล้ว (ครั้ง)", width: 14 },
    { key: "ระบบเดาว่า", width: 34 },
    { key: "ไซต์ในระบบ", width: 46 },
    { key: "ลูกค้าในระบบ", width: 34 },
    { key: "เลขที่สัญญาที่ถูกต้อง (แก้ตรงนี้)", width: 30 },
  ];
  const rows = [...matched, ...skipped.map((x) => ({ ...x, c: null }))].map((m) => ({
    cells: [
      { v: m.site },
      { v: m.done },
      { v: m.c ? m.c.contract_no : m.why || "" },
      { v: m.c ? siteName.get(m.c.site_id) || "" : "" },
      { v: m.c ? coName.get(m.c.company_id) || "" : "" },
      { v: m.c ? m.c.contract_no : "", s: S.TEXT },
    ],
  }));
  const list = contracts
    .slice()
    .sort((a, b) => (a.contract_no || "").localeCompare(b.contract_no || ""))
    .map((c) => ({
      cells: [
        { v: c.contract_no || "" },
        { v: siteName.get(c.site_id) || "" },
        { v: coName.get(c.company_id) || "" },
      ],
    }));

  writeFileSync(
    OUT,
    buildXlsx([
      {
        name: "จับคู่",
        xml: sheetXml({
          cols: COLS.map((c) => ({ width: c.width })),
          rows: [{ cells: COLS.map((c) => ({ v: c.key, s: S.HEAD_OPT })) }, ...rows],
          freezeRows: 1,
          autoFilter: `A1:${colName(COLS.length)}1`,
        }),
      },
      {
        name: "สัญญาในระบบ",
        xml: sheetXml({
          cols: [{ width: 18 }, { width: 52 }, { width: 40 }],
          rows: [
            {
              cells: [
                { v: "เลขที่สัญญา", s: S.HEAD_OPT },
                { v: "ไซต์", s: S.HEAD_OPT },
                { v: "ลูกค้า", s: S.HEAD_OPT },
              ],
            },
            ...list,
          ],
          freezeRows: 1,
        }),
      },
    ])
  );
  console.log(`✓ เขียน ${OUT} แล้ว — แก้คอลัมน์สุดท้ายแล้วส่งกลับมา`);
  process.exit(0);
}

if (!APPLY) {
  console.log("ยังไม่ได้เขียนอะไร — ตรวจการจับคู่ข้างบน");
  console.log("   --export  เขียนแผ่นตรวจการจับคู่ออกมาแก้");
  console.log("   --apply   เขียนใบงานย้อนหลังลงระบบ");
  process.exit(0);
}

// ---------------------------------------------------------------------------
//  เขียนใบงานย้อนหลัง
// ---------------------------------------------------------------------------
/**
 * Rounds 1..N of each contract get a finished work order, on the owner's word
 * that no cleaning has ever been missed. The round's own due date is used as
 * the day it happened: the plan's service dates are half prose and half Excel
 * date serials, and a due date at least says which quarter's visit this was
 * rather than inventing a precision nobody recorded.
 *
 * A round that already points at a job is left alone, so this can be re-run
 * after another export without doubling anything.
 */
let created = 0;
let already = 0;
let short = [];

for (const m of matched) {
  const { data: visits, error: vErr } = await sb
    .from("service_visits")
    .select("id, seq, due_date, work_order_id")
    .eq("contract_id", m.c.id)
    .eq("org_id", ORG.id)
    .order("seq")
    .limit(m.done);
  if (vErr) throw new Error(`อ่านรอบของ ${m.c.contract_no} ไม่ได้: ${vErr.message}`);
  if ((visits ?? []).length < m.done) {
    short.push(`${m.c.contract_no} มี ${visits.length} รอบ แต่ล้างไป ${m.done} ครั้ง`);
  }

  for (const v of visits ?? []) {
    if (v.work_order_id) {
      already++;
      continue;
    }
    const { data: wo, error } = await sb
      .from("work_orders")
      .insert({
        org_id: ORG.id,
        title: `ล้างแผงโซลาร์ ครั้งที่ ${v.seq}`,
        type: "electrical",
        status: "completed",
        priority: "normal",
        job_class: "PM",
        billing: "contract",
        board_key: m.c.board_key,
        company_id: m.c.company_id,
        site_id: m.c.site_id,
        contract_id: m.c.id,
        scheduled_start: `${v.due_date}T09:00:00+07:00`,
        completed_at: `${v.due_date}T12:00:00+07:00`,
        description: `บันทึกย้อนหลังจากแผน Aftersales — ${m.site}`,
      })
      .select("id")
      .single();
    if (error) throw new Error(`สร้างใบงานของ ${m.c.contract_no} รอบ ${v.seq} ไม่ได้: ${error.message}`);

    const { error: lErr } = await sb
      .from("service_visits")
      .update({ work_order_id: wo.id })
      .eq("id", v.id)
      .eq("org_id", ORG.id);
    if (lErr) throw new Error(`ผูกใบงานกับรอบ ${v.seq} ไม่ได้: ${lErr.message}`);
    created++;
  }
}

console.log(`สร้างใบงานย้อนหลัง ${created} ใบ · มีอยู่แล้ว ${already} รอบ`);
if (short.length) {
  console.log("รอบในระบบน้อยกว่าจำนวนครั้งที่ล้าง:");
  short.forEach((x) => console.log(`   ${x}`));
}
