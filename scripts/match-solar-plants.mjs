/**
 * Puts the customer's name beside each plant in the FusionSolar export.
 *
 *   node scripts/match-solar-plants.mjs            # ทดลอง — แสดงผลจับคู่
 *   node scripts/match-solar-plants.mjs --apply    # เขียนคอลัมน์ลงไฟล์
 *
 * A plant name in the portal is written the way the installer typed it —
 * "บจ.ธนวิน 24 (7-11) ปตท. ธนวิน24" — so the customer, the shop and the
 * station all share one field. The customer is the part that matches a company
 * we already have: fold away the legal wrapper, the spacing and the sara-am,
 * and the registered name is a substring of the plant name. Longest match
 * wins, so a branch ("… สาขา1") beats the parent name it contains.
 *
 * What that cannot reach is a name the portal wrote in another script or
 * another spelling — "Bakerystory" for เบเกอรี่ สตอรี่, "นครพาทัพย์เจริญ" for
 * นครพาทรัพย์เจริญ. Those are listed in BY_HAND with the reason, and each one
 * is checked against the customer list on every run, so a rename cannot leave a
 * silent mismatch behind.
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { readSheet } from "./xlsx-read.mjs";
import { S, colName, sheetXml, buildXlsx } from "./xlsx-write.mjs";

const FILE = "import-data/solar_grid_connection_dates.xlsx";
const SHEET = "Grid Connection";
const APPLY = process.argv.includes("--apply");

/** Plants whose name never spells the customer the way the customer is filed. */
const BY_HAND = {
  "Bakerystory": ["บริษัท เบเกอรี่ สตอรี่ จำกัด", "ทับศัพท์ — และเป็นระเบียนที่ถือไซต์อยู่"],
  "Homemadedsign": ["โฮมเมดดีไซน์", "ทับศัพท์"],
  "Buri Gallery House Resort": ["ห้างหุ้นส่วนจำกัด บุรีแกลอรี่ เฮ้าส์", "ทับศัพท์"],
  "Jarin Home": ["คุณจรินทร์ ตั้งจิตการุญ", "ทับศัพท์ — ชื่อเดียวในระบบที่อ่านว่า Jarin"],
  "Amazon Star จ.มหาสารคาม": [
    "ห้างหุ้นส่วน จำกัด สารคามพัฒนาการก่อสร้าง",
    "เจ้าของไซต์ “อเมซอนสตาร์ (ห้าแยก)” มหาสารคาม",
  ],
  "บจ.นครพาทัพย์เจริญ (ปั้มบางจาก เชียงของ)": [
    "บริษัท นครพาทรัพย์เจริญ จำกัด",
    "พิมพ์ตก ร — และเป็นเจ้าของไซต์ “21082025_บางจาก เชียงของ”",
  ],
  "บริษัท อัครปิโตเลียม จำกัด(ปตท.สะพานพระราม 5)": ["บริษัท อัครปิโตรเลียม จำกัด", "พิมพ์ตก ร"],
  "บริษัท เค. ที. ดี. ปิโตเลียม จำกัด ปตท.เขาทอง (ขาออก) นครสวรรค์": [
    "บริษัท เค. ที. ดี.ปิโตรเลียม จำกัด",
    "พิมพ์ตก ร",
  ],
};

const COLS = [
  { key: "No.", width: 6 },
  { key: "Plant Name", width: 62 },
  { key: "Grid Connection Date", width: 22, text: true },
  { key: "Customer (Unicloud)", width: 46 },
];

// ---------------------------------------------------------------------------
//  ลูกค้าใน Unicloud
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

const companies = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("companies").select("id, name").eq("org_id", ORG.id).range(from, from + 999);
  if (error) throw new Error(`อ่าน companies ไม่ได้: ${error.message}`);
  companies.push(...(data ?? []));
  if (!data || data.length < 1000) break;
}

// ---------------------------------------------------------------------------
//  จับคู่
// ---------------------------------------------------------------------------

const s = (v) => String(v ?? "").trim();
/** The ways one Thai name gets typed: sara-am, spacing, punctuation, case. */
const fold = (v) =>
  s(v).replace(/ํา/g, "ำ").replace(/จํากัด/g, "จำกัด").toLowerCase().replace(/[\s.·,\-_'"()]/g, "");
/** The distinctive part — legal wrapper off both ends. */
const core = (v) =>
  fold(v)
    .replace(/^(บริษัท|บจก|บจ|ห้างหุ้นส่วนจำกัด|ห้างหุ้นส่วน|หจก)/, "")
    .replace(/(จำกัด)?(มหาชน)?(จำกัด)?$/, "");

/**
 * The ways a filed name can be read: as it stands, and with the trailing marks
 * the office added to tell one branch from another peeled off. Both
 * "… ปิโตรเลียม (เมือง)" and "… เซอร์วิส สำนักงานใหญ่" are customers the
 * portal writes under the plain name.
 */
const keysOf = (name) => {
  const keys = [];
  let bare = s(name);
  for (;;) {
    keys.push(core(bare));
    const peeled = bare.replace(/\s*(\([^)]*\)|สำนักงานใหญ่|\(?สนญ\)?)\s*$/, "");
    if (peeled === bare) break;
    bare = peeled;
  }
  return [...new Set(keys)].filter((k) => k.length >= 4);
};

const index = companies.flatMap((c) => keysOf(c.name).map((key) => ({ key, c })));

const byName = new Map(companies.map((c) => [fold(c.name), c]));
for (const [plant, [name, why]] of Object.entries(BY_HAND)) {
  if (!byName.has(fold(name)))
    throw new Error(`BY_HAND ชี้ไปที่ลูกค้าที่ไม่มีแล้ว: “${name}” (${plant} — ${why})`);
}

/** The customer for one plant, and how we got there. */
function customerOf(plant) {
  const hand = BY_HAND[s(plant)];
  if (hand) return { name: hand[0], how: `กรอกมือ: ${hand[1]}` };

  const f = fold(plant);
  const hits = index.filter((e) => f.includes(e.key)).sort((a, b) => b.key.length - a.key.length);
  if (!hits.length) return { name: "", how: "" };

  const best = hits[0];
  const tied = hits.filter((h) => h.key.length === best.key.length && h.c.id !== best.c.id);
  return {
    name: best.c.name,
    how: tied.length ? `ชื่อพ้อง: ${tied.map((t) => t.c.name).join(" / ")}` : "ชื่อตรง",
  };
}

// ---------------------------------------------------------------------------

const sheet = readSheet(FILE, SHEET);
const head = (sheet.rows[0] ?? []).map(s);
if (head[0] !== "No." || head[1] !== "Plant Name")
  throw new Error(`หัวตารางไม่ใช่ที่คาดไว้: ${head.join(" | ")}`);

const isPlant = (r) => /^\d+$/.test(s(r[0]));
const matched = [];
const missing = [];

const body = sheet.rows.slice(1).map((r) => {
  // ท้ายตารางเป็นบล็อกหมายเหตุ ไม่ใช่แผงโซลาร์ — ปล่อยไว้อย่างเดิม
  if (!isPlant(r)) return { cells: [{ v: s(r[0]), s: S.NOTE }] };
  const { name, how } = customerOf(r[1]);
  (name ? matched : missing).push({ no: s(r[0]), plant: s(r[1]), name, how });
  return {
    cells: [
      { v: s(r[0]), s: S.BODY },
      { v: s(r[1]), s: S.WRAP },
      { v: s(r[2]), s: S.TEXT },
      { v: name, s: S.WRAP },
    ],
  };
});

for (const m of [...matched, ...missing]) {
  console.log(`${m.no.padStart(3)} ${m.name ? "·" : "✗"} ${m.plant}`);
  console.log(`     ${m.name || "— ไม่พบลูกค้าที่ตรง"}${m.how ? `   (${m.how})` : ""}`);
}
console.log(
  `\nแผง ${matched.length + missing.length} รายการ · จับคู่ได้ ${matched.length} · ไม่พบ ${missing.length}`
);

if (!APPLY) {
  console.log("โหมด: ทดลอง — ใส่ --apply เพื่อเขียนไฟล์");
  process.exit(0);
}

try {
  appendFileSync(FILE, "");
} catch (e) {
  console.error(`\n✗ เขียนทับ ${FILE} ไม่ได้ (${e.code}) — ปิดไฟล์ใน Excel ก่อน`);
  process.exit(1);
}

const NOTE =
  "Customer (Unicloud): the customer each plant belongs to, matched against the Unicloud customer list.";
if (!body.some((r) => r.cells.length === 1 && s(r.cells[0].v).startsWith("Customer (Unicloud)")))
  body.push({ cells: [{ v: NOTE, s: S.NOTE }] });

writeFileSync(
  FILE,
  buildXlsx([
    {
      name: SHEET,
      xml: sheetXml({
        cols: COLS.map((c) => ({ width: c.width, style: c.text ? S.TEXT : undefined })),
        rows: [{ cells: COLS.map((c) => ({ v: c.key, s: S.HEAD_OPT })) }, ...body],
        freezeRows: 1,
        autoFilter: `A1:${colName(COLS.length)}1`,
      }),
    },
  ])
);
console.log(`✓ เขียน ${FILE} แล้ว — เพิ่มคอลัมน์ Customer (Unicloud)`);
