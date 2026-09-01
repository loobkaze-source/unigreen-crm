/**
 * Puts the Hoymiles sites under contract, counted from the day they were
 * switched on.
 *
 *   node scripts/import-hoymiles-contracts.mjs
 *   node scripts/import-hoymiles-contracts.mjs --apply
 *
 * The refreshed devices export carries the plant's power-on date, its capacity
 * and its S-Miles plant id. From the date come three things:
 *
 *   panel cleaning   5 years at a PTT or Amazon site, 2 years everywhere else,
 *                    twice a year, starting the day the plant went live
 *   installation     2 years, every site, same start
 *   the assets       install_date on every DTU and micro-inverter at the site
 *
 * A contract whose term has already run out is written as completed rather
 * than active: it is history, and the service board only asks about live ones.
 *
 * Nothing here invents a visit that happened. Rounds that fell due while the
 * contract was live are created pending, and `close-ung-rounds.mjs` is the one
 * that says they were served — that is a claim about the world and belongs in
 * its own command.
 *
 * Dry by default; --apply writes. Re-runnable: a site that already has one of
 * these contracts is skipped rather than given a second.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { readSheet, excelSerialToYmd } from "./xlsx-read.mjs";

const APPLY = process.argv.includes("--apply");
const FILE = "c:/CRM/import-data/Hoymiles_Sites_Devices.xlsx";

/** Twice a year, as every solar contract in the book already is. */
const CLEANINGS_PER_YEAR = 2;
/** A station keeps its panels clean for five years; everyone else, two. */
const YEARS_STATION = 5;
const YEARS_OTHER = 2;
/** The installation is warranted for two years wherever it was installed. */
const WARRANTY_YEARS = 2;

/** "ไซต์ ปตท. หรือ อเมซอน" — the fuel-station and café sites. */
const isStation = (name) => /ปตท|ptt|amazon|อเมซอน/i.test(name);

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

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const ymd = (v) => {
  const s = clean(v);
  if (!s) return "";
  return /^\d+(\.\d+)?$/.test(s) ? excelSerialToYmd(Math.floor(Number(s))) : s.slice(0, 10);
};
/** Date arithmetic on the calendar, not on milliseconds. */
const addMonths = (date, n) => {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, d));
  return t.toISOString().slice(0, 10);
};
const today = new Date().toISOString().slice(0, 10);

async function all(query) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

// ---------------------------------------------------------------------------
//  One plant per site, as the sheet has it
// ---------------------------------------------------------------------------
const plants = new Map();
for (const r of readSheet(FILE, "Sites").rows.slice(1)) {
  const name = clean(r[1]);
  // The sheet ends in a block of provenance notes; a real row has a DTU.
  if (!name || !clean(r[2])) continue;
  const on = ymd(r[9]);
  if (!plants.has(name)) plants.set(name, { name, on, kw: 0, plantId: clean(r[7]), dtus: [] });
  const p = plants.get(name);
  // Two DTUs at one site were switched on together; the earliest is the plant.
  if (on && (!p.on || on < p.on)) p.on = on;
  p.kw = Math.max(p.kw, Number(clean(r[8])) || 0);
  p.dtus.push(clean(r[2]).toUpperCase());
}

// ---------------------------------------------------------------------------
//  What the CRM already has
// ---------------------------------------------------------------------------
const [sites, contracts, warranties, orgs, dtus] = await Promise.all([
  all(() => sb.from("sites").select("id,name,company_id,org_id,notes")),
  all(() => sb.from("service_contracts").select("id,site_id,service_type,start_date")),
  all(() => sb.from("warranties").select("id,site_id,kind,title")),
  all(() => sb.from("organizations").select("id")),
  all(() =>
    sb.from("equipment").select("serial_number,site_id").eq("brand", "HOYMILES").eq("category", "DTU")
  ),
]);
const ORG = orgs[0].id;
const byName = new Map(sites.map((s) => [clean(s.name), s]));
const byId = new Map(sites.map((s) => [s.id, s]));
/**
 * The serial, before the name. Between one export and the next a plant can be
 * renamed — "เชียงใหม่การบัญชีธุรกิจและกฎหมาย" came back as "CM Acc." — but the
 * DTU bolted to the wall is the same DTU, and it already knows its site.
 */
const bySerial = new Map(dtus.map((d) => [clean(d.serial_number).toUpperCase(), d.site_id]));
const hasCleaning = new Set(contracts.filter((c) => c.service_type === "panel_cleaning").map((c) => c.site_id));
const hasWarranty = new Set(warranties.filter((w) => w.kind === "project").map((w) => w.site_id));

const plan = [];
const missing = [];
for (const p of plants.values()) {
  const viaSerial = p.dtus.map((sn) => bySerial.get(sn)).find(Boolean);
  const site = (viaSerial && byId.get(viaSerial)) || byName.get(p.name);
  if (!site) {
    missing.push(p.name);
    continue;
  }
  const years = isStation(p.name) ? YEARS_STATION : YEARS_OTHER;
  const cleaningEnd = addMonths(p.on, years * 12);
  const warrantyEnd = addMonths(p.on, WARRANTY_YEARS * 12);
  const rounds = CLEANINGS_PER_YEAR * years;
  const interval = 12 / CLEANINGS_PER_YEAR;
  const due = Array.from({ length: rounds }, (_, i) => addMonths(p.on, i * interval));
  plan.push({
    ...p,
    site,
    years,
    cleaningEnd,
    warrantyEnd,
    due,
    pastDue: due.filter((d) => d <= today).length,
    needsCleaning: !hasCleaning.has(site.id),
    needsWarranty: !hasWarranty.has(site.id),
  });
}

const station = plan.filter((p) => p.years === YEARS_STATION);
const other = plan.filter((p) => p.years === YEARS_OTHER);
const newCleaning = plan.filter((p) => p.needsCleaning);
const newWarranty = plan.filter((p) => p.needsWarranty);
const expired = newCleaning.filter((p) => p.cleaningEnd < today);

console.log(`\nโรงไฟฟ้าในไฟล์ ${plants.size} แห่ง · จับคู่ไซต์ในระบบได้ ${plan.length}`);
if (missing.length) console.log(`หาไซต์ไม่เจอ: ${missing.join(", ")}`);
console.log(`\nสัญญาล้างแผง — ปตท./Amazon 5 ปี: ${station.length} · ที่เหลือ 2 ปี: ${other.length}`);
console.log(`  สร้างใหม่ ${newCleaning.length} (มีอยู่แล้ว ${plan.length - newCleaning.length})`);
console.log(`  ในนั้นหมดอายุไปแล้ว ${expired.length} — บันทึกเป็น completed`);
console.log(`  รอบทั้งหมด ${newCleaning.reduce((n, p) => n + p.due.length, 0)} รอบ`);
console.log(
  `  รอบที่ตกอยู่ในอดีตของสัญญาที่ยังไม่หมดอายุ ${newCleaning
    .filter((p) => p.cleaningEnd >= today)
    .reduce((n, p) => n + p.pastDue, 0)} รอบ — สร้างเป็น pending`
);
console.log(`\nรับประกันงานติดตั้ง 2 ปี: สร้างใหม่ ${newWarranty.length} (ยังไม่หมดอายุ ${newWarranty.filter((p) => p.warrantyEnd >= today).length})`);

console.log("\n--- รายไซต์ ---");
for (const p of plan.sort((a, b) => a.on.localeCompare(b.on))) {
  console.log(
    `${p.years}ปี | Power On ${p.on} | ถึง ${p.cleaningEnd} ${p.cleaningEnd < today ? "(หมดอายุ)" : "(ใช้งาน)"} | ` +
      `${String(p.kw).padStart(6)} kW | ${p.due.length} รอบ (ผ่านมาแล้ว ${p.pastDue}) | ${p.name}` +
      (clean(p.site.name) === p.name ? "" : `  [ไซต์ในระบบ: ${p.site.name}]`)
  );
}

if (!APPLY) {
  console.log("\n(ทดลองรัน — ใส่ --apply เพื่อบันทึกจริง)");
} else {
  let madeContracts = 0;
  let madeVisits = 0;
  let madeWarranties = 0;
  let touchedAssets = 0;

  for (const p of plan) {
    if (p.needsCleaning) {
      const { data: c, error } = await sb
        .from("service_contracts")
        .insert({
          org_id: ORG,
          company_id: p.site.company_id,
          site_id: p.site.id,
          title: `สัญญาบำรุงรักษาโซลาร์ ${p.years} ปี — ${p.name}`,
          service_type: "panel_cleaning",
          start_date: p.on,
          end_date: p.cleaningEnd,
          frequency_per_year: CLEANINGS_PER_YEAR,
          duration_years: p.years,
          board_key: "UNG",
          status: p.cleaningEnd < today ? "completed" : "active",
          notes: `เริ่มนับจากวัน Power On ${p.on} · ${p.kw} kW · Plant ID ${p.plantId}`,
        })
        .select("id")
        .single();
      if (error) console.error(`  x สัญญา ${p.name}: ${error.message}`);
      else {
        madeContracts++;
        const visits = p.due.map((d, i) => ({
          org_id: ORG,
          contract_id: c.id,
          seq: i + 1,
          due_date: d,
        }));
        const { error: vErr } = await sb.from("service_visits").insert(visits);
        if (vErr) console.error(`  x รอบของ ${p.name}: ${vErr.message}`);
        else madeVisits += visits.length;
      }
    }

    if (p.needsWarranty) {
      const { error } = await sb.from("warranties").insert({
        org_id: ORG,
        kind: "project",
        company_id: p.site.company_id,
        site_id: p.site.id,
        title: `รับประกันงานติดตั้ง ${WARRANTY_YEARS} ปี — ${p.name}`,
        provider: "Unigreen Power Co., Ltd.",
        start_date: p.on,
        end_date: p.warrantyEnd,
        status: p.warrantyEnd < today ? "expired" : "active",
        terms: `รับประกันงานติดตั้งระบบโซลาร์ ${WARRANTY_YEARS} ปี นับจากวัน Power On`,
      });
      if (error) console.error(`  x รับประกัน ${p.name}: ${error.message}`);
      else madeWarranties++;
    }

    // The day the plant went live is the day its boxes were installed.
    const { count, error: eErr } = await sb
      .from("equipment")
      .update({ install_date: p.on }, { count: "exact" })
      .eq("site_id", p.site.id)
      .eq("brand", "HOYMILES")
      .is("install_date", null);
    if (eErr) console.error(`  x install_date ${p.name}: ${eErr.message}`);
    else touchedAssets += count ?? 0;

    if (!p.site.notes) {
      await sb
        .from("sites")
        .update({ notes: `โซลาร์ ${p.kw} kW · Power On ${p.on} · Hoymiles Plant ID ${p.plantId}` })
        .eq("id", p.site.id);
    }
  }

  console.log(`\nสร้างสัญญาล้างแผง ${madeContracts} ฉบับ · รอบบริการ ${madeVisits} รอบ`);
  console.log(`สร้างการรับประกัน ${madeWarranties} รายการ`);
  console.log(`ลง install_date ให้อุปกรณ์ ${touchedAssets} รายการ`);
}
