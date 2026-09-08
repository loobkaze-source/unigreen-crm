/**
 * Brings the Hoymiles solar fleet into the CRM: the customers who own it, the
 * sites it stands on, and the boxes themselves.
 *
 *   node scripts/import-hoymiles.mjs
 *   node scripts/import-hoymiles.mjs --apply
 *
 * Two exports, joined on the DTU serial number:
 *   Hoymiles_Sites_Customers — who owns the plant, with its registration number
 *   Hoymiles_Sites_Devices   — the DTU, and how many micro-inverters hang off it
 *
 * Nothing is matched on a name where a number will do. A company is found by
 * its 13-digit registration number first and only then by name, and a DTU by
 * its serial — so running this again after another export updates what is
 * there rather than making a second copy of it in a database that already
 * holds 539 companies and 2,480 sites.
 *
 * Dry by default; --apply writes.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { readSheet } from "./xlsx-read.mjs";

const APPLY = process.argv.includes("--apply");
const DIR = "c:/CRM/import-data";

/**
 * Placeholders the sheet uses where the owner is not yet known. They are not
 * customers and no company is created for them: the site is imported without
 * one and shows as unassigned, rather than as a customer called "(ยังไม่ระบุ)".
 */
const NOT_A_CUSTOMER = new Set(["(ยังไม่ระบุ)", "ลูกค้าบุคคล", "-", ""]);

/**
 * A plant at a PTT station is named after whatever building it stands on —
 * "บจ.ปทุมพฤกษรักษ์ ปิโตรเลี่ยม (7-11) ปตท.พลูตาหลวง" — which scatters eleven
 * petrol stations down an alphabetical list between a bicycle shop and a block
 * of flats. The prefix puts them together and says what they are at a glance.
 *
 * The shop and the café on the forecourt count: they are at a PTT station,
 * which is what a technician needs to know before driving there. Café Amazon
 * counts on its own name too — it is PTT's brand, and every one in this fleet
 * is on a forecourt. Shell is not PTT and keeps the name it came with.
 */
const PTT_PREFIX = "PTT Station ";
const siteName = (name) =>
  /ปตท|ptt|amazon|อเมซอน/i.test(name) && !name.startsWith(PTT_PREFIX)
    ? PTT_PREFIX + name
    : name;

/** ออนไลน์ / ออฟไลน์ as the asset pages spell it. */
const STATUS = new Map([
  ["ออนไลน์", "operational"],
  ["ออฟไลน์", "down"],
]);

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
const digits = (v) => clean(v).replace(/\D/g, "");
/**
 * A name with the spacing and the legal form taken out of it — the two systems
 * write "ห้างหุ้นส่วนจำกัด" and "ห้างหุ้นส่วน จำกัด" and "บริษัท  X" for the
 * same customer. Used only to warn about a lookalike, never to merge on: two
 * registrations of the same family business are two customers.
 */
const nameKey = (v) =>
  clean(v)
    .replace(/ห้างหุ้นส่วน\s*จำกัด|หจก\.?|บริษัท|จำกัด|\(มหาชน\)|บจ\.?|บมจ\.?/g, "")
    .replace(/[\s.\-()]/g, "")
    .toLowerCase();

/** PostgREST caps a response at 1,000 rows and says nothing about it. */
async function all(table, cols) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

// ---------------------------------------------------------------------------
//  What the sheets say
// ---------------------------------------------------------------------------
const custRows = readSheet(`${DIR}/Hoymiles_Sites_Customers.xlsx`, "Customers")
  .rows.slice(1)
  .filter((r) => clean(r[1]));
const devRows = readSheet(`${DIR}/Hoymiles_Sites_Devices.xlsx`, "Sites")
  .rows.slice(1)
  .filter((r) => clean(r[2]));

const owner = new Map();
for (const r of custRows) {
  owner.set(clean(r[1]).toUpperCase(), {
    site: clean(r[2]),
    company: clean(r[3]),
    taxId: digits(r[4]),
    note: clean(r[8]),
  });
}

/** One DTU, with the site and the owner the other sheet gives it. */
const units = devRows.map((r) => {
  const serial = clean(r[2]).toUpperCase();
  const o = owner.get(serial) ?? {};
  const company = o.company ?? "";
  return {
    serial,
    site: siteName(o.site || clean(r[1])),
    company: NOT_A_CUSTOMER.has(company) ? "" : company,
    taxId: o.taxId ?? "",
    note: o.note ?? "",
    dtuModel: clean(r[3]),
    dtuStatus: STATUS.get(clean(r[4])) ?? "operational",
    miCount: Number(digits(r[5])) || 0,
    miModel: clean(r[6]),
  };
});

// ---------------------------------------------------------------------------
//  What the CRM already has
// ---------------------------------------------------------------------------
const [companies, sites, equipment, orgs] = await Promise.all([
  all("companies", "id,name,tax_id"),
  all("sites", "id,name,company_id"),
  all("equipment", "id,serial_number,name,site_id"),
  all("organizations", "id,name"),
]);
const ORG = orgs[0]?.id;
if (!ORG) throw new Error("ไม่พบ organization");

const byTax = new Map(companies.filter((c) => digits(c.tax_id)).map((c) => [digits(c.tax_id), c]));
const byCompanyName = new Map(companies.map((c) => [clean(c.name), c]));
const bySiteName = new Map(sites.map((s) => [clean(s.name), s]));
const bySerial = new Map(
  equipment.filter((e) => e.serial_number).map((e) => [clean(e.serial_number).toUpperCase(), e])
);
const lookalikes = new Map();
for (const c of companies) {
  const k = nameKey(c.name);
  if (!lookalikes.has(k)) lookalikes.set(k, []);
  lookalikes.get(k).push(c);
}

// ---------------------------------------------------------------------------
//  The plan
// ---------------------------------------------------------------------------
const newCompanies = new Map();
const newSites = new Map();
const newAssets = [];
const keptAssets = [];
const matchedCompanies = [];
const matchedSites = [];

for (const u of units) {
  if (u.company) {
    const found = (u.taxId && byTax.get(u.taxId)) || byCompanyName.get(u.company);
    if (found) matchedCompanies.push(`${u.company} → ${found.name}`);
    else if (!newCompanies.has(u.company)) {
      newCompanies.set(u.company, {
        name: u.company,
        tax_id: u.taxId || null,
        industry: "โซลาร์ (Hoymiles)",
        notes: u.note || null,
      });
    }
  }
  if (bySiteName.has(u.site)) matchedSites.push(u.site);
  else if (!newSites.has(u.site))
    newSites.set(u.site, { name: u.site, company: u.company, taxId: u.taxId });

  if (bySerial.has(u.serial)) keptAssets.push(u);
  else newAssets.push(u);
}

console.log(`\nไฟล์: DTU ${units.length} เครื่อง · ไซต์ ${new Set(units.map((u) => u.site)).size} แห่ง`);
console.log(`ในระบบ: companies ${companies.length} · sites ${sites.length} · equipment ${equipment.length}`);

console.log(`\nลูกค้า: มีอยู่แล้ว ${new Set(matchedCompanies).size} · สร้างใหม่ ${newCompanies.size}`);
for (const m of new Set(matchedCompanies)) console.log(`  = ${m}`);
for (const c of newCompanies.values()) {
  console.log(`  + ${c.name}${c.tax_id ? ` (${c.tax_id})` : " (ไม่มีเลขทะเบียน)"}`);
  // Reported, not merged: a lookalike with a different registration number is
  // a different legal entity, and only a person can say whether it is also a
  // different customer.
  for (const near of lookalikes.get(nameKey(c.name)) ?? [])
    console.log(`      ⚠ ชื่อคล้าย: ${near.name}${near.tax_id ? ` [${near.tax_id}]` : ""}`);
}

console.log(`\nไซต์งาน: มีอยู่แล้ว ${new Set(matchedSites).size} · สร้างใหม่ ${newSites.size}`);
for (const m of new Set(matchedSites)) console.log(`  = ${m}`);
for (const s of newSites.values()) console.log(`  + ${s.name}  ←  ${s.company || "ยังไม่ระบุลูกค้า"}`);

const miRows = newAssets.filter((u) => u.miCount > 0).length;
console.log(`\nอุปกรณ์: DTU ใหม่ ${newAssets.length} · มีอยู่แล้ว ${keptAssets.length}`);
for (const u of keptAssets) console.log(`  = ${u.serial} (${bySerial.get(u.serial).name})`);
console.log(`  + ไมโครอินเวอร์เตอร์อีก ${miRows} รายการ — 1 รายการต่อ DTU, จำนวนอยู่ในชื่อ`);
console.log(`  รวมที่จะสร้าง ${newAssets.length + miRows} รายการ`);

if (!APPLY) {
  console.log("\n(ทดลองรัน — ใส่ --apply เพื่อบันทึกจริง)");
} else {
  for (const c of newCompanies.values()) {
    const { data, error } = await sb
      .from("companies")
      .insert({ org_id: ORG, name: c.name, tax_id: c.tax_id, industry: c.industry, notes: c.notes })
      .select("id,name,tax_id")
      .single();
    if (error) {
      console.error(`  x ${c.name}: ${error.message}`);
      continue;
    }
    byCompanyName.set(clean(data.name), data);
    if (digits(data.tax_id)) byTax.set(digits(data.tax_id), data);
  }
  console.log(`\nสร้างลูกค้า ${newCompanies.size} ราย`);

  for (const s of newSites.values()) {
    // By registration number first, exactly as the plan matched it. Going by
    // name alone put five sites under no customer at all: the CRM writes
    // "ห้างหุ้นส่วน จำกัด" where the sheet writes "ห้างหุ้นส่วนจำกัด", and the
    // tax id is the only thing the two agree on.
    const company =
      (s.taxId && byTax.get(s.taxId)) || (s.company && byCompanyName.get(s.company)) || null;
    const { data, error } = await sb
      .from("sites")
      .insert({ org_id: ORG, name: s.name, company_id: company?.id ?? null })
      .select("id,name")
      .single();
    if (error) {
      console.error(`  x ${s.name}: ${error.message}`);
      continue;
    }
    bySiteName.set(clean(data.name), data);
  }
  console.log(`สร้างไซต์งาน ${newSites.size} แห่ง`);

  let made = 0;
  for (const u of newAssets) {
    const site = bySiteName.get(u.site);
    if (!site) {
      console.error(`  x ${u.serial}: ไม่พบไซต์ ${u.site}`);
      continue;
    }
    const rows = [
      {
        org_id: ORG,
        site_id: site.id,
        name: `DTU ${u.dtuModel}`,
        category: "DTU",
        brand: "HOYMILES",
        model: u.dtuModel,
        serial_number: u.serial,
        status: u.dtuStatus,
      },
    ];
    // The export counts the micro-inverters but does not serialise them, so
    // they go in as the one thing it does know: how many, of what, here.
    if (u.miCount > 0) {
      rows.push({
        org_id: ORG,
        site_id: site.id,
        name: `ไมโครอินเวอร์เตอร์ ${u.miModel} × ${u.miCount}`,
        category: "Inverter",
        brand: "HOYMILES",
        model: u.miModel,
        status: "operational",
        notes: `จำนวน ${u.miCount} ตัว · ต่อกับ DTU ${u.serial} (จากรายงาน Hoymiles)`,
      });
    }
    const { error } = await sb.from("equipment").insert(rows);
    if (error) {
      console.error(`  x ${u.serial}: ${error.message}`);
      continue;
    }
    made += rows.length;
  }
  console.log(`สร้างอุปกรณ์ ${made} รายการ`);
}
