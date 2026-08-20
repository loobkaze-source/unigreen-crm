/**
 * Turns the FusionSolar plant list into the two sheets that put those plants
 * into the CRM: the sites that are missing, and a five-year service contract
 * for every site that carries a plant.
 *
 *   node scripts/plan-solar-service.mjs
 *   node scripts/import-xlsx.mjs import-data/solar-1-sites.xlsx --apply
 *   node scripts/import-xlsx.mjs import-data/solar-2-contracts.xlsx --apply
 *
 * Which plant stands on which site — most of them on a station the CRM already
 * knows — is read by placePlants in solar-plants.mjs, so the machines on those
 * roofs can be placed by the same reading rather than a second copy of it.
 *
 * A station's two roofs — the shop and the canopy — are two plants at one
 * address, and the CRM knows one place there. They share the site, and the
 * contract on it starts from whichever roof was energised first, with both
 * dates written into its notes.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { SITES, SERVICE_CONTRACTS } from "./import-schema.mjs";
import { buildTemplateWorkbook } from "./import-workbook.mjs";
import { SOURCE, placePlants, norm } from "./solar-plants.mjs";

const OUT_SITES = "import-data/solar-1-sites.xlsx";
const OUT_CONTRACTS = "import-data/solar-2-contracts.xlsx";

/** The type the app now shows as “สัญญาบำรุงรักษาโซลาร์”. */
const SERVICE_TYPE = "panel_cleaning";
const BOARD = "unigreen";
const FREQUENCY = 2;
const YEARS = 5;

// ---------------------------------------------------------------------------

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

/** Each plant on the site it belongs to — an existing one, or one to create. */
const placed = await placePlants({ sb, orgId: ORG.id });

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
  notes: `ระบบโซลาร์ในพอร์ทัล FusionSolar · ขนานไฟ ${p.date}`,
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
    `สัญญา ${YEARS} ปี ไซต์ละ 1 ฉบับ นับจากวันขนานไฟของระบบโซลาร์ตัวแรกในไซต์นั้น`,
    `ประเภทงาน ${SERVICE_TYPE} · บอร์ด ${BOARD} · ${FREQUENCY} ครั้ง/ปี`,
  ])
);

// ---------------------------------------------------------------------------

console.log(`ระบบโซลาร์ ${placed.length} · ไซต์ที่เกี่ยวข้อง ${bySite.size} (เดิม ${bySite.size - newSites.length} · ใหม่ ${newSites.length})\n`);
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
