/**
 * Converts the legacy "asset list" export into our customer / site / asset
 * templates.
 *
 *   node scripts/convert-assetlist.mjs "import-data/asset list services sales.xlsx"
 *
 * The hard part is one column. Everything about where a machine lives is
 * crammed into a single free-text field:
 *
 *   Shell-บจก. เฉลิมฉลองบริการ 108/28 หมู่ 5 ต. รัษฎาอ. เมืองภูเก็ต  ภูเก็ต  ภูเก็ต
 *   └brand┘ └────── operator ──────┘ └─────────── address ───────────┘
 *
 * which has to become: customer Shell, site "เฉลิมฉลองบริการ", and that address.
 * Rows without a brand are direct industrial customers instead, where the
 * company named IS the customer and the tail is the branch:
 *
 *   บริษัท ไออาร์พีซี จำกัด (มหาชน) / อยุธยา
 *   └─────────── customer ────────┘   └site┘
 *
 * No single rule covers 2,300 hand-typed strings, so several are tried in turn
 * and each site records which one produced it, in a `วิธีแยก` note. The full
 * original string is always kept, so nothing said here is unrecoverable.
 */
import { writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { readSheet } from "./xlsx-read.mjs";
import { COMPANIES, SITES, ASSETS } from "./import-schema.mjs";
import { buildTemplateWorkbook } from "./import-workbook.mjs";

const src = process.argv[2];
if (!src) {
  console.error('ใช้: node scripts/convert-assetlist.mjs "import-data/<ไฟล์>.xlsx"');
  process.exit(1);
}
const OUT_DIR = dirname(src);

const s = (v) => String(v ?? "").replace(/‌/g, "").trim();
const squash = (v) => s(v).replace(/\s+/g, "");
const norm = (v) => s(v).replace(/\s+/g, " ").toLowerCase();
const noteLines = (pairs) =>
  pairs.filter(([, v]) => s(v)).map(([k, v]) => `${k}: ${s(v)}`).join("\n");

// ---------------------------------------------------------------------------
//  Vocabulary
// ---------------------------------------------------------------------------

/** Fuel brands that own the site rather than operate it. Longest match first. */
const BRANDS = [
  ["PTTOR", ["pttor", "ptt or"]],
  ["PTTRM", ["pttrm"]],
  ["PTG", ["ptg"]],
  ["PTT", ["ptt"]],
  ["PT", ["pt"]],
  ["Shell", ["shell"]],
  ["BCP", ["bcp", "ฺbcp", "ฺฺbcp", "bangchak"]],
  ["ESSO", ["esso", "ess0"]],
  ["Caltex", ["caltex"]],
  ["กรีนเนท", ["กรีนเนท"]],
  ["TBL", ["tbl"]],
  ["BAFS", ["bafs"]],
];

/**
 * Short codes the old system wrote in front of a customer's own name — the
 * company that follows is the customer, the code is just their filing shorthand.
 * Unlike a fuel brand these do not stand for a company of their own.
 */
// TOYO is deliberately absent: "TOYO-THAI CORPORATION" is a company's own name,
// and treating the first half as a code leaves a customer called "THAI
// CORPORATION PUBLIC COMPANY LIMITED".
const NAME_PREFIXES = [
  "TYM", "THM", "GWM", "NPT", "NMT", "AAT",
  "Maxima", "Tatsuno", "APGM", "Henkel", "Flowco", "NBG",
];

/**
 * Which customer each brand's sites belong to, as confirmed by the business.
 * Several are not what the brand name suggests — Esso's Thai stations passed to
 * Bangchak, Green Net is Bangchak's own chain, and PT is PTG's retail brand —
 * so these are recorded rather than inferred.
 */
const BRAND_COMPANY = {
  Shell: "บริษัท เชลล์แห่งประเทศไทย จํากัด",
  BCP: "บริษัท บางจาก คอร์ปอเรชั่น จำกัด (มหาชน)",
  ESSO: "บริษัท บางจาก คอร์ปอเรชั่น จำกัด (มหาชน)",
  กรีนเนท: "บริษัท บางจาก คอร์ปอเรชั่น จำกัด (มหาชน)",
  PTTOR: "บริษัท ปตท. น้ำมันและการค้าปลีก จำกัด (มหาชน)",
  PTTRM: "บริษัท ปตท. น้ำมันและการค้าปลีก จำกัด (มหาชน)",
  PTT: "บริษัท ปตท. น้ำมันและการค้าปลีก จำกัด (มหาชน)",
  PTG: "บริษัท พีทีจี เอ็นเนอยี จำกัด (มหาชน)",
  PT: "บริษัท พีทีจี เอ็นเนอยี จำกัด (มหาชน)",
  Caltex: "บริษัท สตาร์ ปิโตรเลียม รีไฟน์นิ่ง จำกัด (มหาชน)",
  TBL: "บริษัท ที เบลโก้ จำกัด",
  BAFS: "บริษัท บริการเชื้อเพลิงการบินกรุงเทพ จำกัด (มหาชน)",
};

const PROVINCES = `กระบี่ กรุงเทพมหานคร กาญจนบุรี กาฬสินธุ์ กำแพงเพชร ขอนแก่น จันทบุรี ฉะเชิงเทรา ชลบุรี ชัยนาท
ชัยภูมิ ชุมพร เชียงราย เชียงใหม่ ตรัง ตราด ตาก นครนายก นครปฐม นครพนม นครราชสีมา นครศรีธรรมราช นครสวรรค์
นนทบุรี นราธิวาส น่าน บึงกาฬ บุรีรัมย์ ปทุมธานี ประจวบคีรีขันธ์ ปราจีนบุรี ปัตตานี พระนครศรีอยุธยา พะเยา
พังงา พัทลุง พิจิตร พิษณุโลก เพชรบุรี เพชรบูรณ์ แพร่ ภูเก็ต มหาสารคาม มุกดาหาร แม่ฮ่องสอน ยโสธร ยะลา ร้อยเอ็ด
ระนอง ระยอง ราชบุรี ลพบุรี ลำปาง ลำพูน เลย ศรีสะเกษ สกลนคร สงขลา สตูล สมุทรปราการ สมุทรสงคราม สมุทรสาคร
สระแก้ว สระบุรี สิงห์บุรี สุโขทัย สุพรรณบุรี สุราษฎร์ธานี สุรินทร์ หนองคาย หนองบัวลำภู อ่างทอง อำนาจเจริญ
อุดรธานี อุตรดิตถ์ อุทัยธานี อุบลราชธานี`
  .split(/\s+/).filter(Boolean);
/** Written forms that mean Bangkok but are not the official province name. */
const BKK_ALIASES = ["กรุงเทพฯ", "กรุงเทพ", "กทม.", "กทม"];

const ADDR_KEY = /(ถนน|ถ\.|ซอย|ซ\.|หมู่ที่|หมู่|ม\.|แขวง|เขต|ตำบล|ต\.|อำเภอ|อ\.|จังหวัด|จ\.|เลขที่)/;
const LEGAL_HEAD = /^(บริษัท|บจก\.|บมจ\.|หจก\.|ห้างหุ้นส่วนจำกัด|ห้างหุ้นส่วนสามัญ|ห้างหุ้นส่วน)\s*/;
/**
 * `\S.+?` rather than `.*?`: with an empty middle, "ห้างหุ้นส่วน" + "จำกัด"
 * matches the bare prefix "ห้างหุ้นส่วนจำกัด" and a customer gets created with
 * no name at all. Requiring a real name in between sends those rows to the
 * fallback, which keeps the whole partnership name instead.
 */
const LEGAL_FULL =
  /^((?:บริษัท|บจก\.|บมจ\.|หจก\.|ห้างหุ้นส่วนจำกัด|ห้างหุ้นส่วนสามัญ|ห้างหุ้นส่วน)\s*\S.+?(?:จำกัด\s*\(\s*มหาชน\s*\)|จำกัด|\(\s*มหาชน\s*\)))/;

// ---------------------------------------------------------------------------
//  Location parsing
// ---------------------------------------------------------------------------

const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The separator after a brand is not dependable — "ESSOบางเลน" and "PTศรีราชา2"
 * run straight into the name — so a latin brand is also accepted where Thai
 * follows it directly. Requiring a space or dash left 29 sites filed under a
 * customer whose name was the brand plus the station.
 */
function stripBrand(raw) {
  const t = s(raw);
  for (const [canon, forms] of BRANDS) {
    for (const f of forms) {
      const re = new RegExp(`^${esc(f)}(?=[\\s-]|[\\u0E00-\\u0E7F])`, "i");
      if (re.test(t)) return { brand: canon, rest: t.slice(f.length).replace(/^[\s-]+/, "") };
    }
  }
  return { brand: "", rest: t };
}

/** Removes a filing shorthand so the customer's own name is what remains. */
function stripNamePrefix(raw) {
  const t = s(raw);
  for (const p of NAME_PREFIXES) {
    const re = new RegExp(`^${esc(p)}\\s*-\\s*|^${esc(p)}\\s+(?=[\\u0E00-\\u0E7F]|บ)`, "i");
    if (re.test(t)) return t.replace(re, "").trim();
  }
  return t;
}

/** Longest a generated site name may get before it stops being a name. */
const NAME_MAX = 60;

/**
 * Some entries are nothing but an address — no shop name at all. Rather than
 * make the whole address the site name, borrow the district from it.
 */
function nameFromAddress(addr) {
  const area = /(?:อ\.|อำเภอ|เขต)\s*([^\s]+)/.exec(addr) ?? /(?:ต\.|ตำบล|แขวง)\s*([^\s]+)/.exec(addr);
  if (area) return area[1];
  return s(addr).split(/\s+/).slice(0, 4).join(" ");
}

/** A lone "บจก." is a prefix with the name missing, not a company. */
const ONLY_PREFIX = /^(?:บริษัท|บจก\.|บมจ\.|หจก\.|ห้างหุ้นส่วน(?:จำกัด|สามัญ)?)[\s.]*$/;
const dropBarePrefix = (n) => (ONLY_PREFIX.test(s(n)) ? "" : s(n));

function capName(name) {
  const t = s(name);
  return t.length <= NAME_MAX ? t : t.slice(0, NAME_MAX).trim() + "…";
}

/** Splits "<name> <address>" by looking for where an address plausibly starts. */
function splitNameAddress(text) {
  const toks = s(text).split(/\s+/).filter(Boolean);

  // A — a house number: has a slash, or is followed by an address word.
  let depth = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    depth += (t.match(/\(/g) || []).length - (t.match(/\)/g) || []).length;
    if (depth > 0 || /[()]/.test(t)) continue;
    if (!/^\d/.test(t)) continue;
    if (/\//.test(t) || ADDR_KEY.test(toks[i + 1] ?? "")) {
      return { name: toks.slice(0, i).join(" "), addr: toks.slice(i).join(" "), how: "เลขที่บ้าน" };
    }
  }

  // B — the first address word, when the number is missing or glued to text.
  const kw = toks.findIndex((t) => ADDR_KEY.test(t));
  if (kw > 0) {
    return { name: toks.slice(0, kw).join(" "), addr: toks.slice(kw).join(" "), how: "คำบอกที่อยู่" };
  }

  // C — nothing but a trailing province, common for "<operator> <province>".
  for (let i = toks.length - 1; i > 0; i--) {
    const t = toks[i].replace(/[.,]$/, "");
    if (PROVINCES.includes(t) || BKK_ALIASES.includes(t)) {
      return { name: toks.slice(0, i).join(" "), addr: toks.slice(i).join(" "), how: "จังหวัดท้ายสุด" };
    }
  }

  return { name: toks.join(" "), addr: "", how: "แยกไม่ได้" };
}

/**
 * @returns { customer, site, address, brand, how }
 */
function parseLocation(raw) {
  let { brand, rest } = stripBrand(raw);
  if (!brand) {
    // A filing code can sit in front of the brand ("Flowco-PTT จรัญสนิทวงศ์ 14"),
    // so once it is off, look for a brand again.
    const stripped = stripNamePrefix(rest);
    if (stripped !== rest) ({ brand, rest } = stripBrand(stripped));
    else rest = stripped;
  }

  if (brand) {
    const body = rest.replace(LEGAL_HEAD, "").trim();
    const { name, addr, how } = splitNameAddress(body);
    const site = name || nameFromAddress(addr) || body;
    return {
      brand,
      customer: BRAND_COMPANY[brand] ?? brand,
      site: capName(site),
      address: addr,
      how: name ? how : how + " (ไม่มีชื่อร้าน ใช้อำเภอแทน)",
    };
  }

  // No brand: the company named is itself the customer.
  const legal = LEGAL_FULL.exec(rest);
  if (legal) {
    const customer = legal[1].trim();
    const tail = rest.slice(legal[1].length).replace(/^[\s/,-]+/, "").trim();
    const { name, addr, how } = splitNameAddress(tail);
    return {
      brand: "",
      customer,
      site: capName(name || nameFromAddress(addr) || tail || customer),
      address: addr,
      how: tail ? `นิติบุคคล + ${how}` : "นิติบุคคลล้วน",
    };
  }

  // Not a company name either — split off a trailing province and treat the
  // head as both customer and site (e.g. การไฟฟ้าฝ่ายผลิตแห่งประเทศไทย ลำปาง).
  const { name, addr, how } = splitNameAddress(rest);
  const clean = dropBarePrefix(name);
  return {
    brand: "",
    customer: capName(clean || nameFromAddress(addr) || rest),
    site: capName(clean || nameFromAddress(addr) || rest),
    address: addr,
    how: `ไม่มีนิติบุคคล + ${how}`,
  };
}

// ---------------------------------------------------------------------------
//  Asset field mapping
// ---------------------------------------------------------------------------

/** The export seeds unused rows with literal "Example : ..." placeholders. */
const realOrBlank = (v) => (/^example\s*:/i.test(s(v)) ? "" : s(v));

/**
 * A third of the serial column is the text "N/A" rather than an empty cell.
 * Carried through as a value it would read as one serial shared by every such
 * machine on a site, and the importer would fuse them into a single asset.
 */
const NOT_A_VALUE = /^(n\/?a|na|-+|ไม่มี|ไม่ระบุ|none|null)$/i;
const serialOrBlank = (v) => (NOT_A_VALUE.test(s(v)) ? "" : s(v));

function categoryOf(type) {
  const t = norm(type);
  if (/solar|โซลาร์|แผงพลังงาน/.test(t)) return "solar_panel";
  if (/inverter|อินเวอร์เตอร์/.test(t)) return "inverter";
  if (/ev charger|ชาร์จ/.test(t)) return "ev_charger";
  if (/battery|แบตเตอรี่/.test(t)) return "battery";
  if (/meter|มิเตอร์/.test(t)) return "meter";
  return "other";
}

/** "[3]|พร้อมใช้งาน" -> operational · "[4]|อยู่ระหว่างการซ่อม" -> down */
function statusOf(raw) {
  const t = s(raw);
  if (/ซ่อม/.test(t)) return "down";
  if (/ปลดระวาง|เลิกใช้/.test(t)) return "retired";
  return "operational";
}

// ---------------------------------------------------------------------------

const sheet = readSheet(src, "Sheet1");
const H = (sheet.rows[0] ?? []).map(s);
const rows = sheet.rows
  .slice(1)
  .map((r) => Object.fromEntries(H.map((k, i) => [k, s(r[i])])))
  .filter((o) => Object.values(o).some(Boolean));

const C = {
  serial: "เลขรหัสประจำเครื่อง",
  tag: "เลขครุภัณฑ์ (QR Code)",
  type: "ประเภทเครื่องจักร / อุปกรณ์",
  status: "สถานะ",
  loc: "สถานที่ตั้งเครื่องจักร / อุปกรณ์",
  brand: "ยี่ห้อ",
  model: "รุ่น",
  dept: "แผนก",
};

console.log(`ต้นทาง: ${basename(src)}`);
console.log(`อ่านได้: ${rows.length} แถว\n`);

// ---- one site per distinct location string --------------------------------
const byLoc = new Map();
for (const r of rows) {
  const loc = r[C.loc];
  if (!loc) continue;
  if (!byLoc.has(loc)) byLoc.set(loc, parseLocation(loc));
}

const howTally = new Map();
for (const p of byLoc.values()) howTally.set(p.how, (howTally.get(p.how) ?? 0) + 1);

// Site names must be unique per customer or the importer treats them as one.
const seen = new Map();
for (const [loc, p] of byLoc) {
  const key = `${norm(p.customer)}|${norm(p.site)}`;
  const hit = seen.get(key);
  if (hit === undefined) {
    seen.set(key, 1);
    continue;
  }
  seen.set(key, hit + 1);
  // Prefer something meaningful from the address over a bare counter.
  const hint = (p.address.match(/(?:อ\.|อำเภอ|เขต)\s*([^\s]+)/) ?? [])[1] ?? String(hit + 1);
  p.site = `${p.site} (${hint})`;
  p.renamed = true;
}

// ---- customers -------------------------------------------------------------
const customers = new Map();
for (const p of byLoc.values()) {
  const k = norm(p.customer);
  if (!k) continue;
  if (!customers.has(k)) customers.set(k, { name: p.customer, brand: p.brand, sites: 0 });
  customers.get(k).sites++;
}

const companyRows = [...customers.values()]
  .sort((a, b) => b.sites - a.sites)
  .map((c) => ({
    name: c.name,
    tax_id: "",
    customer_code: "",
    tags: c.brand || "",
    industry: "",
    phone: "",
    website: "",
    address: "",
    notes: noteLines([
      ["ที่มา", `รายการ Asset จาก ${basename(src)}`],
      ["จำนวนไซต์ในไฟล์นี้", String(c.sites)],
      [
        "ต้องตรวจ",
        /^[A-Za-z]{2,6}$/.test(c.name) || c.name === "กรีนเนท"
          ? "ชื่อนี้เป็นชื่อแบรนด์ ยังไม่ใช่ชื่อนิติบุคคล — ต้องแก้เป็นชื่อจดทะเบียนและใส่ tax_id"
          : "",
      ],
    ]),
  }));

// ---- sites -----------------------------------------------------------------
const siteRows = [...byLoc.entries()].map(([loc, p]) => ({
  name: p.site,
  tax_id: "",
  customer_code: "",
  company_name: p.customer,
  address: p.address,
  map_url: "",
  contact_name: "",
  contact_phone: "",
  notes: noteLines([
    ["แบรนด์", p.brand],
    ["วิธีแยกข้อมูล", p.how + (p.renamed ? " (ชื่อซ้ำ จึงเติมวงเล็บแยก)" : "")],
    ["ข้อความเดิมจากระบบเก่า", loc],
  ]),
}));

// ---- assets ----------------------------------------------------------------
const assetRows = rows.map((r) => {
  const p = byLoc.get(r[C.loc]);
  return {
    site_name: p ? p.site : "",
    name: s(r[C.type]) || "อุปกรณ์",
    asset_tag: s(r[C.tag]),
    asset_type: "object",
    category: categoryOf(r[C.type]),
    brand: realOrBlank(r[C.brand]),
    model: realOrBlank(r[C.model]),
    serial_number: serialOrBlank(r[C.serial]),
    project_number: "",
    group_name: "",
    install_date: "",
    warranty_start: "",
    warranty_months: "",
    status: statusOf(r[C.status]),
    notes: noteLines([
      ["แผนก", r[C.dept]],
      ["สถานะในระบบเก่า", r[C.status]],
      ["สถานที่ตั้งเดิม", r[C.loc]],
      ["เลขรหัสประจำเครื่องเดิม", serialOrBlank(r[C.serial]) ? "" : r[C.serial]],
    ]),
  };
});

// ---- write -----------------------------------------------------------------
const notes = [
  `แถวในชีต “ข้อมูล” แปลงมาจาก ${basename(src)} ด้วย scripts/convert-assetlist.mjs — ตรวจก่อนนำเข้า`,
  "ช่องสถานที่ในระบบเก่ารวมแบรนด์ ชื่อไซต์ และที่อยู่ไว้ด้วยกัน สคริปต์แยกให้ด้วยกฎหลายชั้น",
  "ทุกไซต์เก็บข้อความเดิมไว้ในช่อง notes พร้อมบอกว่าใช้วิธีไหนแยก — แถวไหนดูผิดแก้ในชีตนี้ได้เลย",
];

for (const [spec, data, file, label] of [
  [COMPANIES, companyRows, "asset-1-companies.xlsx", "ลูกค้า"],
  [SITES, siteRows, "asset-2-sites.xlsx", "ไซต์งาน"],
  [ASSETS, assetRows, "asset-3-assets.xlsx", "Asset"],
]) {
  writeFileSync(join(OUT_DIR, file), buildTemplateWorkbook(spec, data, notes));
  console.log(`✓ ${file}  ${label} ${data.length} แถว`);
}

console.log("\nวิธีที่ใช้แยกชื่อไซต์กับที่อยู่:");
[...howTally.entries()].sort((a, b) => b[1] - a[1])
  .forEach(([h, n]) => console.log(`   ${String(n).padStart(5)}  ${h}`));

const unresolved = [...byLoc.values()].filter((p) => p.how.includes("แยกไม่ได้"));
console.log(`\nลูกค้าที่จะสร้าง: ${companyRows.length} ราย`);
console.log(`ไซต์ชื่อซ้ำที่ต้องเติมวงเล็บ: ${[...byLoc.values()].filter((p) => p.renamed).length}`);
console.log(`ไซต์ที่แยกที่อยู่ไม่ได้ (ชื่อจะยาว ควรตรวจ): ${unresolved.length}`);
unresolved.slice(0, 10).forEach((p) => console.log(`   ${p.site.slice(0, 95)}`));

const noSite = assetRows.filter((a) => !a.site_name).length;
if (noSite) console.log(`\n⚠ Asset ที่ไม่มีไซต์: ${noSite}`);
