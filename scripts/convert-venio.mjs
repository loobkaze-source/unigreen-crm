/**
 * Converts a Venio customer export into our import templates.
 *
 *   node scripts/convert-venio.mjs "import-data/<venio export>.xlsx"
 *
 * Reads the Customers / Contacts / Locations sheets and writes three filled
 * copies of our templates next to the source. Nothing touches the database —
 * review the output, then feed it to import-xlsx.mjs.
 *
 * Venio carries more fields than our schema has columns for. Rather than lose
 * them, the ones worth filtering on become tags and the rest are written into
 * notes as labelled lines, so nothing in the export is thrown away.
 */
import { writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { readSheet } from "./xlsx-read.mjs";
import { COMPANIES, CONTACTS, SITES } from "./import-schema.mjs";
import { buildTemplateWorkbook } from "./import-workbook.mjs";

const src = process.argv[2];
if (!src) {
  console.error('ใช้: node scripts/convert-venio.mjs "import-data/<ไฟล์ Venio>.xlsx"');
  process.exit(1);
}
const OUT_DIR = dirname(src);

// ---------------------------------------------------------------------------

const s = (v) => String(v ?? "").trim();
const squash = (v) => s(v).replace(/\s+/g, "");
const norm = (v) => s(v).replace(/\s+/g, " ").toLowerCase();

/** Reads a sheet into objects keyed by its header row. */
function sheetRows(file, name) {
  const sh = readSheet(file, name);
  const head = (sh.rows[0] ?? []).map((h) => s(h));
  return sh.rows
    .slice(1)
    .map((r) => Object.fromEntries(head.map((k, i) => [k, s(r[i])])))
    .filter((o) => Object.values(o).some(Boolean));
}

/** Labelled lines, blank fields omitted. */
const noteLines = (pairs) =>
  pairs.filter(([, v]) => s(v)).map(([k, v]) => `${k}: ${s(v)}`).join("\n");

const splitList = (v) => s(v).split(",").map((x) => x.trim()).filter(Boolean);

/**
 * Bangchak and BCP are the same brand, and the CRM already uses BCP — keeping
 * both spellings would split the tag filter in two.
 */
const TAG_ALIASES = new Map([["bangchak", "BCP"]]);
const tag = (v) => TAG_ALIASES.get(norm(v)) ?? s(v);

function tagsFor(c) {
  const out = [
    ...splitList(c["Customer Group"]).map(tag),
    ...splitList(c["Interested in"]).map(tag),
    // A bare "B" means nothing as a filter chip; the class needs its label.
    ...splitList(c.Classification).map((x) => `Class ${x}`),
  ];
  return [...new Set(out.filter(Boolean))].join(", ");
}

const escapeRe = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Thai address parts are usually written with one of these in front. */
const PART_PREFIX = "(?:ต\\.|อ\\.|จ\\.|ตำบล|อำเภอ|จังหวัด|แขวง|เขต)?\\s*";

/**
 * Venio keeps the address parts in their own columns, and only 10 of 150
 * Address cells spell the whole thing out — 116 carry no administrative part at
 * all (some are just a Plus Code), so the parts have to be appended.
 *
 * Appending blindly puts them in the wrong order whenever Address already ends
 * with, say, the province and postcode. So any part already sitting at the tail
 * is peeled off first, then the full tail is rebuilt in the canonical order.
 */
function composeAddress(l) {
  const parts = [l.Subdistrict, l.District, l.Province, l.Zipcode].map(s).filter(Boolean);
  let base = s(l.Address);

  for (let peeled = true; peeled; ) {
    peeled = false;
    for (const p of parts) {
      const re = new RegExp(`[\\s,]*${PART_PREFIX}${escapeRe(p)}\\s*$`, "i");
      if (re.test(base)) {
        base = base.replace(re, "");
        peeled = true;
      }
    }
  }

  const tail = parts.filter((p) => !squash(base).includes(squash(p)));
  return [base, ...tail].join(" ").replace(/\s+/g, " ").trim();
}

const mapUrl = (l) =>
  s(l.Latitude) && s(l.Longitude)
    ? `https://www.google.com/maps?q=${s(l.Latitude)},${s(l.Longitude)}`
    : "";

const HONORIFIC = /^(mr|mrs|ms|miss|k)[.'’]\s*/i;

/**
 * "MR. LAI HUU MANH" -> first "LAI", last "HUU MANH". Latin honorifics are
 * dropped because they would otherwise land in first_name; Thai "คุณ" is left
 * alone since it is usually glued to the name and splitting it would be a guess.
 */
function splitName(full) {
  const cleaned = s(full).replace(HONORIFIC, "").replace(/^(นาย|นาง|นางสาว)\s+/, "");
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? s(full), last: parts.slice(1).join(" ") };
}

// ---------------------------------------------------------------------------

const customers = sheetRows(src, "Customers-Venio-V2");
const contacts = sheetRows(src, "Contacts-Venio-V2");
const locations = sheetRows(src, "Locations-Venio-V2");

/** Customer Code is fully populated and unique in the export — index on it. */
const byCode = new Map(customers.map((c) => [norm(c["Customer Code"]), c]));
const byName = new Map(customers.map((c) => [norm(c["Customer Name"]), c]));
const lookup = (r) =>
  byCode.get(norm(r["Customer Code"])) ?? byName.get(norm(r["Customer Name"])) ?? null;

/** The Billing location doubles as the customer's registered address. */
const billing = new Map();
for (const l of locations) {
  const key = norm(l["Customer Code"]);
  if (!billing.has(key) || norm(l["Location Type"]) === "billing") billing.set(key, l);
}

const warnings = [];

// ---- companies -------------------------------------------------------------
const companyRows = customers.map((c) => {
  const addr = billing.get(norm(c["Customer Code"]));
  return {
    name: s(c["Customer Name"]),
    tax_id: s(c["Tax ID"]),
    customer_code: s(c["Customer Code"]),
    tags: tagsFor(c),
    industry: "",
    phone: s(c.Mobile) || s(c.Telephone),
    website: "",
    address: addr ? composeAddress(addr) : "",
    notes: noteLines([
      ["ประเภทลูกค้า", [s(c.State), s(c.Type)].filter(Boolean).join(" / ")],
      ["Lead State", c["Lead State"]],
      ["สถานะ Venio", norm(c.Status) === "active" ? "" : c.Status],
      ["ชื่อเรียก", c["Customer Alias"]],
      ["ที่มาของลูกค้า", c["Source of Customer"]],
      ["ผู้ดูแล (รหัสพนักงาน Venio)", c["Staff Owner"]],
      ["ผู้แนะนำ", c["คนที่แนะนำมา (Referral)"]],
      ["ภาค", c["ภาค"]],
      ["จังหวัด", c["จังหวัด"]],
      // phone took Mobile; keep the office line rather than lose it
      ["โทรสำนักงาน", s(c.Mobile) && s(c.Telephone) ? c.Telephone : ""],
      ["อีเมล", c["E-mail"]],
      ["Fax", c.Fax],
      ["Maps link", c["Maps link"]],
      ["หมายเหตุเดิม", c.Note],
    ]),
  };
});

// ---- contacts --------------------------------------------------------------
const contactRows = contacts.map((r) => {
  const c = lookup(r);
  if (!c)
    warnings.push(`ผู้ติดต่อ “${s(r["Contact Name"])}” — หาลูกค้า ${s(r["Customer Code"])} ในชีต Customers ไม่เจอ`);
  const { first, last } = splitName(r["Contact Name"]);
  return {
    first_name: first,
    last_name: last,
    tax_id: c ? s(c["Tax ID"]) : "",
    customer_code: s(r["Customer Code"]),
    company_name: s(r["Customer Name"]),
    title: s(r.Position),
    phone: s(r.Mobile) || s(r.Telephone),
    email: s(r["E-mail"]),
    notes: noteLines([
      ["ชื่อเล่น", r.Nickname],
      ["โทรสำนักงาน", s(r.Mobile) && s(r.Telephone) ? r.Telephone : ""],
      ["แท็ก Venio", r.Tags],
    ]),
  };
});

// ---- sites -----------------------------------------------------------------
const siteRows = locations.map((l) => {
  const c = lookup(l);
  if (!c)
    warnings.push(`สถานที่ “${s(l["Location Name"])}” — หาลูกค้า ${s(l["Customer Code"])} ในชีต Customers ไม่เจอ`);
  return {
    name: s(l["Location Name"]),
    tax_id: c ? s(c["Tax ID"]) : "",
    customer_code: s(l["Customer Code"]),
    company_name: s(l["Customer Name"]),
    address: composeAddress(l),
    map_url: mapUrl(l),
    contact_name: "",
    contact_phone: "",
    notes: noteLines([
      ["ประเภทที่อยู่ (Venio)", l["Location Type"]],
      ["รหัสสาขา", l["Branch Code"]],
      ["พิกัด", s(l.Latitude) && s(l.Longitude) ? `${s(l.Latitude)}, ${s(l.Longitude)}` : ""],
    ]),
  };
});

/**
 * The importer matches a site by customer + name, so two locations sharing a
 * name under one customer would overwrite each other — and here they are real,
 * different addresses (a Billing one and a Shipping one). Give the clashing
 * ones a distinguishing suffix instead of silently losing an address.
 */
function disambiguateSiteNames(rows, sources) {
  const groups = new Map();
  rows.forEach((r, i) => {
    const k = `${norm(r.customer_code)}|${norm(r.name)}`;
    (groups.get(k) ?? groups.set(k, []).get(k)).push(i);
  });

  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    const used = new Set();
    for (const i of idxs) {
      const l = sources[i];
      for (const hint of [s(l.District), s(l["Location Type"]), String(idxs.indexOf(i) + 1)]) {
        if (hint && !used.has(hint)) {
          used.add(hint);
          rows[i].name = `${rows[i].name} (${hint})`;
          break;
        }
      }
    }
    warnings.push(
      `ไซต์ชื่อซ้ำภายใต้ลูกค้าเดียวกัน ${idxs.length} แถว — เติมวงเล็บแยกให้แล้ว: ` +
        idxs.map((i) => rows[i].name).join("  |  ")
    );
  }
}
disambiguateSiteNames(siteRows, locations);

// ---- keys that would collide on import -------------------------------------
function reportDupes(rows, keyOf, label) {
  const seen = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!k) continue;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  for (const [k, n] of seen) if (n > 1) warnings.push(`${label} ซ้ำ ${n} แถว: ${k}`);
}
reportDupes(companyRows, (r) => norm(r.customer_code), "รหัสลูกค้า");
reportDupes(companyRows, (r) => norm(r.tax_id), "เลขผู้เสียภาษี");
reportDupes(companyRows, (r) => norm(r.name), "ชื่อลูกค้า");
reportDupes(siteRows, (r) => `${norm(r.customer_code)}|${norm(r.name)}`, "ไซต์ (ลูกค้า + ชื่อ)");

// ---- write -----------------------------------------------------------------
const stamp = basename(src).replace(/\.xlsx$/i, "");
const jobs = [
  [COMPANIES, companyRows, "venio-1-companies.xlsx", "ลูกค้า"],
  [CONTACTS, contactRows, "venio-2-contacts.xlsx", "ผู้ติดต่อ"],
  [SITES, siteRows, "venio-3-sites.xlsx", "ไซต์งาน"],
];

console.log(`ต้นทาง: ${basename(src)}`);
console.log(`อ่านได้: ลูกค้า ${customers.length} · ผู้ติดต่อ ${contacts.length} · สถานที่ ${locations.length}\n`);

for (const [spec, rows, file, label] of jobs) {
  const notes = [
    `แถวในชีต “ข้อมูล” แปลงมาจาก ${stamp} ด้วย scripts/convert-venio.mjs — ตรวจก่อนนำเข้า`,
    "ฟิลด์ของ Venio ที่ระบบนี้ไม่มีคอลัมน์รองรับ ถูกเก็บไว้ในช่อง notes เป็นบรรทัดที่มีป้ายกำกับ",
  ];
  writeFileSync(join(OUT_DIR, file), buildTemplateWorkbook(spec, rows, notes));
  const pct = spec.cols
    .map((c) => `${c.key} ${Math.round((rows.filter((r) => s(r[c.key])).length / rows.length) * 100)}%`)
    .join(" · ");
  console.log(`✓ ${file}  ${label} ${rows.length} แถว`);
  console.log(`    ${pct}`);
}

if (warnings.length) {
  console.log(`\n⚠ ต้องตรวจ ${warnings.length} จุด:`);
  for (const w of warnings) console.log(`   • ${w}`);
}
