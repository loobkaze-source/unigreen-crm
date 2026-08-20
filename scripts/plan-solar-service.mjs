/**
 * Turns the FusionSolar plant list into the two sheets that put those plants
 * into the CRM: the sites that are missing, and a five-year service contract
 * for every site that carries a plant.
 *
 *   node scripts/plan-solar-service.mjs
 *   node scripts/import-xlsx.mjs import-data/solar-1-sites.xlsx --apply
 *   node scripts/import-xlsx.mjs import-data/solar-2-contracts.xlsx --apply
 *
 * Most of these stations are already in the CRM under the same customer, so a
 * site per plant would put a second record on a station that has one — the
 * duplicate the merge pass spent its time removing. LINKS is that reading,
 * made by hand off the customer's site names, addresses and coordinates: the
 * plant belongs to a station we already know, and this is the record for it.
 * A plant not listed there is a place we do not have, and gets a site of its
 * own named after the plant.
 *
 * A station's two roofs — the shop and the canopy — are two plants at one
 * address, and the CRM knows one place there. They share the site, and the
 * contract on it starts from whichever roof was energised first, with both
 * dates written into its notes.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { readSheet } from "./xlsx-read.mjs";
import { SITES, SERVICE_CONTRACTS } from "./import-schema.mjs";
import { buildTemplateWorkbook } from "./import-workbook.mjs";

const SOURCE = "import-data/solar_grid_connection_dates.xlsx";
const OUT_SITES = "import-data/solar-1-sites.xlsx";
const OUT_CONTRACTS = "import-data/solar-2-contracts.xlsx";

/** The type the app now shows as “สัญญาบำรุงรักษาโซลาร์”. */
const SERVICE_TYPE = "panel_cleaning";
const BOARD = "unigreen";
const FREQUENCY = 2;
const YEARS = 5;

/**
 * Plant No. → [the customer's existing site it sits on, why we read it that
 * way]. Anything missing here is created as a new site.
 */
const LINKS = {
  1: ["(บางขุนนนท์)", "ไซต์เดียวของลูกค้า และมีอุปกรณ์ Solar Cell อยู่แล้ว"],
  7: ["Buahan Village Hotel", "โรงแรมเดียวกัน"],
  8: ["PTT Station ปตท.แยกอนุกูลนารี (น้ำมัน+EV)", "สถานีเดียวกับชื่อแผง"],
  9: ["PTT Station ปตท.แยกอนุกูลนารี (น้ำมัน+EV)", "สถานีเดียวกับชื่อแผง"],
  15: ["PTT Station", "บรบือ — ลูกค้ามีสองระเบียนพิกัดเดียวกัน เลือกที่อยู่ส่งของ"],
  16: ["PTT Station", "บรบือ — ลูกค้ามีสองระเบียนพิกัดเดียวกัน เลือกที่อยู่ส่งของ"],
  17: ["Gas station PTT Amnat Charoen.", "ไซต์เดียวของลูกค้า"],
  18: ["Gas station PTT Amnat Charoen.", "ไซต์เดียวของลูกค้า"],
  19: ["PTT Station ปตท.ไก่คำ (น้ำมัน+EV) (ptt kai kham gas station)", "ไก่คำ — สองระเบียนพิกัดเดียวกัน เลือกที่อยู่ส่งของ"],
  20: ["PTT Station ปตท.ไก่คำ (น้ำมัน+EV) (ptt kai kham gas station)", "ไก่คำ — สองระเบียนพิกัดเดียวกัน เลือกที่อยู่ส่งของ"],
  21: ["ปั๊ม ปตท.บจก.รัตนชาติ 999", "ที่อยู่เป็นถนนทุ่งโพธิ์ ตรงกับชื่อแผง"],
  22: ["PTT Station (Petrol+EV)", "ที่อยู่เป็น ต.นางั่ว ตรงกับชื่อแผง"],
  23: ["PTT Station (Petrol+EV)", "ที่อยู่เป็น ต.นางั่ว ตรงกับชื่อแผง"],
  24: ["PTT Station", "ศรีเทพ — ไซต์เดียวของลูกค้า"],
  25: ["PTT Station", "ศรีเทพ — ไซต์เดียวของลูกค้า"],
  26: ["PTT Station (Petrol+EV)", "มหาราช จันทบุรี — ไซต์เดียวของลูกค้า"],
  27: ["PTT Station ปตท.เมืองเกษตรวิสัย (น้ำมัน+EV)", "สองระเบียนพิกัดเดียวกัน เลือกที่อยู่ส่งของ"],
  28: ["PTT Station ปตท.เมืองเกษตรวิสัย (น้ำมัน+EV)", "สองระเบียนพิกัดเดียวกัน เลือกที่อยู่ส่งของ"],
  29: ["PTT Station", "สาขา1 — ระเบียนที่เป็นตัวสถานี"],
  30: ["7-11 ปตท.เกษตรวิสัย", "สาขา1 — ระเบียนที่เป็นตัว 7-11"],
  31: ["PTT Station (Petrol+EV) 304 Industrial", "นิคมฯ 304 — สองระเบียนพิกัดเดียวกัน เลือกที่อยู่ส่งของ"],
  32: ["PTT Station (Petrol+EV) 304 Industrial", "นิคมฯ 304 — สองระเบียนพิกัดเดียวกัน เลือกที่อยู่ส่งของ"],
  35: ["PTT Station ปตท. สาขา พระยาตรัง - ท่าใหม่", "สถานีเดียวกับชื่อแผง"],
  36: ["PTT Station ปตท. สาขา พระยาตรัง - ท่าใหม่", "สถานีเดียวกับชื่อแผง"],
  38: ["7-Eleven สาขา PTTOR น้ำชุน (หล่มสัก) (10169)", "ปตท. หล่มสัก — ไซต์เดียวของลูกค้า"],
  39: ["7-Eleven สาขา PTTOR น้ำชุน (หล่มสัก) (10169)", "ปตท. หล่มสัก — ไซต์เดียวของลูกค้า"],
  40: ["PTT Station", "หล่มสัก — เหลือสองระเบียนพิกัดเดียวกัน เลือกที่อยู่ส่งของ"],
  41: ["PTT Station", "หล่มสัก — เหลือสองระเบียนพิกัดเดียวกัน เลือกที่อยู่ส่งของ"],
  42: ["PTT", "แยกเกษมพล สัตหีบ ชลบุรี — ไซต์เดียวของลูกค้า"],
  43: ["PTT", "แยกเกษมพล สัตหีบ ชลบุรี — ไซต์เดียวของลูกค้า"],
  45: ["PTT Station", "แม่ปั๋ง พร้าว — ไซต์เดียวของลูกค้า"],
  46: ["PTT Station", "แม่ปั๋ง พร้าว — ไซต์เดียวของลูกค้า"],
  47: ["อเมซอนสตาร์ (ห้าแยก)", "ชื่อไซต์ตรงกับชื่อแผง"],
  52: ["21082025_บางจาก เชียงของ", "ชื่อไซต์ตรงกับชื่อแผง และมีอุปกรณ์อยู่แล้ว 11 ชิ้น"],
  53: ["PTT Station ปตท.สะพานพระราม 5 (ขาเข้า) (น้ำมัน+EV)", "สถานีเดียวกับชื่อแผง"],
  55: ["ปตท. หจก.โพธิ์สว่างออยล์", "ชื่อไซต์ตรงกับชื่อแผง"],
  56: ["PTT Station (Petrol+NGV+EV)", "ไซต์เดียวของลูกค้าในนครสวรรค์ — ที่อยู่ในระบบเป็น ต.ยางตาล ไม่ใช่เขาทอง"],
};

// ---------------------------------------------------------------------------

const s = (v) => String(v ?? "").trim();
const norm = (v) => s(v).replace(/ํา/g, "ำ").replace(/จํากัด/g, "จำกัด").replace(/\s+/g, " ").toLowerCase();

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
const companies = await loadAll("companies", "id, name");
const sites = await loadAll("sites", "id, name, company_id");
const byCompany = new Map(companies.map((c) => [norm(c.name), c]));

// ---------------------------------------------------------------------------

const sheet = readSheet(SOURCE, "Grid Connection");
const head = (sheet.rows[0] ?? []).map(s);
if (head[3] !== "Customer (Unicloud)")
  throw new Error("ไฟล์ต้นทางยังไม่มีคอลัมน์ Customer (Unicloud) — รัน match-solar-plants.mjs ก่อน");

const plants = sheet.rows.slice(1)
  .filter((r) => /^\d+$/.test(s(r[0])))
  .map((r) => ({ no: Number(r[0]), plant: s(r[1]), date: s(r[2]), customer: s(r[3]) }));

/** Each plant on the site it belongs to — an existing one, or one to create. */
const placed = plants.map((p) => {
  const co = byCompany.get(norm(p.customer));
  if (!co) throw new Error(`[${p.no}] ไม่พบลูกค้า “${p.customer}” ในระบบ`);

  const link = LINKS[p.no];
  if (!link) return { ...p, co, siteName: p.plant, isNew: true, why: "ยังไม่มีไซต์นี้ในระบบ" };

  const [siteName, why] = link;
  const hits = sites.filter((x) => x.company_id === co.id && norm(x.name) === norm(siteName));
  if (hits.length !== 1)
    throw new Error(
      `[${p.no}] LINKS ชี้ไปที่ไซต์ “${siteName}” ของ ${co.name} แต่พบ ${hits.length} แห่ง — ` +
      "ไซต์อาจถูกเปลี่ยนชื่อหรือรวมไปแล้ว ตรวจตารางก่อน"
    );
  return { ...p, co, siteName: hits[0].name, siteId: hits[0].id, isNew: false, why };
});

/** One row per site: the plants on it, earliest grid connection first. */
const bySite = new Map();
for (const p of placed) {
  const key = `${p.co.id}|${norm(p.siteName)}`;
  const group = bySite.get(key) ?? bySite.set(key, { site: p, plants: [] }).get(key);
  group.plants.push(p);
}
for (const g of bySite.values()) g.plants.sort((a, b) => a.date.localeCompare(b.date));

// ---------------------------------------------------------------------------
//  แผ่นนำเข้า
// ---------------------------------------------------------------------------

const newSites = placed.filter((p) => p.isNew);
const siteRows = newSites.map((p) => ({
  name: p.plant,
  company_name: p.co.name,
  notes: `แผงโซลาร์ในระบบ FusionSolar · ขนานไฟ ${p.date}`,
}));

// A station is filed under a name as plain as "PTT Station" more than once, so
// the customer goes in the title — five contracts of the same name help nobody.
const contractRows = [...bySite.values()].map(({ site, plants: ps }) => ({
  title: `สัญญาบำรุงรักษาโซลาร์ ${YEARS} ปี — ${site.co.name} · ${site.siteName}`,
  company_name: site.co.name,
  site_name: site.siteName,
  service_type: SERVICE_TYPE,
  start_date: ps[0].date,
  frequency_per_year: String(FREQUENCY),
  duration_years: String(YEARS),
  board_key: BOARD,
  status: "active",
  notes: ps.map((p) => `${p.plant} (ขนานไฟ ${p.date})`).join("\n"),
}));

writeFileSync(
  OUT_SITES,
  buildTemplateWorkbook(SITES, siteRows, [
    `ไซต์ที่ยังไม่มีในระบบ จาก ${SOURCE} — ชื่อไซต์ใช้ Plant Name ตามในพอร์ทัล`,
  ])
);
writeFileSync(
  OUT_CONTRACTS,
  buildTemplateWorkbook(SERVICE_CONTRACTS, contractRows, [
    `สัญญา ${YEARS} ปี ไซต์ละ 1 ฉบับ นับจากวันขนานไฟของแผงแรกในไซต์นั้น`,
    `ประเภทงาน ${SERVICE_TYPE} · บอร์ด ${BOARD} · ${FREQUENCY} ครั้ง/ปี`,
  ])
);

// ---------------------------------------------------------------------------

console.log(`แผง ${placed.length} · ไซต์ที่เกี่ยวข้อง ${bySite.size} (เดิม ${bySite.size - newSites.length} · ใหม่ ${newSites.length})\n`);
for (const { site, plants: ps } of bySite.values()) {
  console.log(`${site.isNew ? "＋" : "→"} ${site.siteName}`);
  console.log(`    ลูกค้า: ${site.co.name}   (${site.why})`);
  for (const p of ps) console.log(`    · [${p.no}] ${p.plant}  ${p.date}`);
  console.log(`    สัญญา: ${ps[0].date} → อีก ${YEARS} ปี · ${FREQUENCY} ครั้ง/ปี · ${FREQUENCY * YEARS} รอบ`);
}
console.log(`\n✓ ${OUT_SITES} — ${siteRows.length} ไซต์ใหม่`);
console.log(`✓ ${OUT_CONTRACTS} — ${contractRows.length} สัญญา (รวม ${contractRows.length * FREQUENCY * YEARS} รอบเข้าบริการ)`);
console.log("\nนำเข้าด้วย (ทดลองก่อน แล้วค่อยใส่ --apply):");
console.log(`   node scripts/import-xlsx.mjs ${OUT_SITES}`);
console.log(`   node scripts/import-xlsx.mjs ${OUT_CONTRACTS}`);
