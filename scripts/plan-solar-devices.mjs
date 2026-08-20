/**
 * Turns the FusionSolar device export into the Asset sheet for those plants.
 *
 *   node scripts/plan-solar-devices.mjs "import-data/Device Information_20260820094806.xlsx"
 *   node scripts/import-xlsx.mjs import-data/solar-3-assets.xlsx --apply
 *
 * The portal lists a machine under a plant, and a plant is a site here — the
 * same reading plan-solar-service.mjs used for the contracts, taken from
 * solar-plants.mjs so the two cannot drift apart.
 *
 * The two exports were taken months apart and a plant name is free text, so
 * five of them differ by a single letter — "ออโต้เซลล์" against "ออโต้เซลส์",
 * "แม่ปั๋ง" against "แม่ปิ๋ง". A name that matches nothing exactly is allowed
 * one edit, and only when exactly one plant is that close; every pairing made
 * that way is printed, and a device whose plant is still unplaced stops the
 * run rather than being dropped quietly.
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { readSheet } from "./xlsx-read.mjs";
import { ASSETS } from "./import-schema.mjs";
import { buildTemplateWorkbook } from "./import-workbook.mjs";
import { placePlants, norm, s } from "./solar-plants.mjs";

const FILE = process.argv[2] ?? "import-data/Device Information_20260820094806.xlsx";
const OUT = "import-data/solar-3-assets.xlsx";

/** Every machine in this export is Huawei — SUN2000, SDongleA, SmartLogger. */
const BRAND = "Huawei";

/** The portal's live state, in the four the CRM knows. */
const STATUS = { Running: "operational", Offline: "down", Idle: "degraded" };

/** The portal writes an unset field as a tab and two dashes. */
const val = (v) => {
  const t = s(v).replace(/^\t/, "").trim();
  return t === "--" || t === "-" ? "" : t;
};

/** Levenshtein, capped: anything past `max` is "too far" and stops early. */
function within(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      best = Math.min(best, cur[j]);
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

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

const placed = await placePlants({ sb, orgId: ORG.id });
const byPlant = new Map(placed.map((p) => [norm(p.plant), p]));

// ---------------------------------------------------------------------------
//  อุปกรณ์จากพอร์ทัล
// ---------------------------------------------------------------------------

const sheet = readSheet(FILE);
const head = (sheet.rows[0] ?? []).map(val);
const NEEDED = ["Plant Name", "Device Type", "Model", "SN", "Device Status"];
const missing = NEEDED.filter((k) => !head.includes(k));
if (missing.length) throw new Error(`ไฟล์นี้ไม่มีคอลัมน์ ${missing.join(", ")}`);

const devices = sheet.rows.slice(1)
  .map((r) => Object.fromEntries(head.map((k, i) => [k, val(r[i])])))
  .filter((d) => d.SN);

/** วันที่ดึงข้อมูลออกจากพอร์ทัล — อยู่ในชื่อไฟล์ (…_YYYYMMDDhhmmss.xlsx) */
const stamp = /_(\d{4})(\d{2})(\d{2})\d{6}/.exec(FILE);
const TAKEN = stamp ? `${stamp[1]}-${stamp[2]}-${stamp[3]}` : "";

// ---- ระบบโซลาร์ในไฟล์อุปกรณ์ → ไซต์ ----------------------------------------
const fuzzy = [];
const unplaced = new Set();
const siteOf = new Map(); // plant name (as written here) -> placed plant
for (const name of new Set(devices.map((d) => d["Plant Name"]))) {
  const exact = byPlant.get(norm(name));
  if (exact) {
    siteOf.set(name, exact);
    continue;
  }
  const near = placed.filter((p) => within(norm(p.plant), norm(name), 1));
  if (near.length === 1) {
    siteOf.set(name, near[0]);
    fuzzy.push([name, near[0].plant]);
  } else unplaced.add(`${name}${near.length ? `  (ใกล้เคียง ${near.length} รายการ)` : ""}`);
}

// ---- เครื่องเดียว ลงทะเบียนสองระบบ ------------------------------------------
/**
 * An inverter moved between plants keeps its serial and gains a second entry:
 * the portal shows it Running where it stands now and Offline where it used to.
 * One machine is one asset, so the live registration is the one that counts and
 * the stale one is written into its notes. Two live entries for one serial is
 * not something to pick between here.
 */
const bySn = new Map();
for (const d of devices) (bySn.get(d.SN) ?? bySn.set(d.SN, []).get(d.SN)).push(d);

const moved = [];
const keep = [];
for (const [sn, group] of bySn) {
  if (group.length === 1) {
    keep.push({ d: group[0], stale: [] });
    continue;
  }
  const live = group.filter((d) => d["Device Status"] === "Running");
  if (live.length !== 1)
    throw new Error(
      `S/N ${sn} มี ${group.length} รายการ และ Running ${live.length} รายการ — ` +
      `ตัดสินไม่ได้ว่าเครื่องอยู่ที่ไหน (${group.map((d) => d["Plant Name"]).join(" / ")})`
    );
  const stale = group.filter((d) => d !== live[0]);
  keep.push({ d: live[0], stale });
  moved.push({ sn, to: live[0]["Plant Name"], from: stale.map((d) => d["Plant Name"]) });
}

// ---- แถวสำหรับเทมเพลต Asset --------------------------------------------------
const rows = keep.map(({ d, stale }) => {
  const site = siteOf.get(d["Plant Name"]);
  const notes = [
    `ที่มา: FusionSolar${TAKEN ? ` (ดึงข้อมูล ${TAKEN})` : ""}`,
    d["Device Name"] ? `ชื่อในพอร์ทัล ${d["Device Name"]}` : "",
    d["Device Number"] ? d["Device Number"] : "",
    d["Device Status"] ? `สถานะพอร์ทัล ${d["Device Status"]}` : "",
    d["Superior equipment"] ? `ต่อผ่าน ${d["Superior equipment"]}` : "",
    stale.length ? `พอร์ทัลมี S/N นี้ค้างที่ ${stale.map((x) => x["Plant Name"]).join(", ")} ด้วย (Offline) — ถือว่าย้ายมาแล้ว` : "",
  ].filter(Boolean).join(" · ");

  return {
    site_name: site?.siteName ?? "",
    company_name: site?.co.name ?? "",
    name: d.Model,
    asset_type: "object",
    category: d["Device Type"],
    brand: BRAND,
    model: d.Model,
    serial_number: d.SN,
    status: STATUS[d["Device Status"]] ?? "operational",
    notes,
  };
});

// ---------------------------------------------------------------------------

if (fuzzy.length) {
  console.log(`ชื่อระบบโซลาร์ต่างกันหนึ่งตัวอักษร จับคู่ให้ ${fuzzy.length} รายการ:`);
  fuzzy.forEach(([a, b]) => console.log(`   ${a}\n      = ${b}`));
  console.log();
}
if (unplaced.size) {
  console.error(`✗ หาระบบโซลาร์เหล่านี้ในไฟล์ขนานไฟไม่เจอ ${unplaced.size} รายการ — ยังไม่เขียนไฟล์`);
  [...unplaced].forEach((p) => console.error(`   ${p}`));
  process.exit(1);
}

writeFileSync(
  OUT,
  buildTemplateWorkbook(ASSETS, rows, [
    `อุปกรณ์จากพอร์ทัล FusionSolar — ${FILE}${TAKEN ? ` (ดึงข้อมูล ${TAKEN})` : ""}`,
    "ชื่อ Asset = Model · serial_number = SN · category = Device Type · status = Device Status",
    `ยี่ห้อกรอกให้เป็น ${BRAND} ทุกแถว — ทั้ง SUN2000, SDongleA และ SmartLogger เป็นของ ${BRAND}`,
  ])
);

const tally = (f) => {
  const m = new Map();
  for (const r of rows) m.set(r[f], (m.get(r[f]) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
console.log(`อุปกรณ์ในไฟล์ ${devices.length} · จะนำเข้า ${rows.length} · ระบบโซลาร์ ${siteOf.size} · ไซต์ ${new Set(rows.map((r) => `${r.company_name}|${r.site_name}`)).size}`);
console.log("\nชนิดเครื่อง:");
tally("category").forEach(([k, n]) => console.log(`   ${String(n).padStart(4)}  ${k}`));
console.log("\nสถานะ:");
tally("status").forEach(([k, n]) => console.log(`   ${String(n).padStart(4)}  ${k}`));
if (moved.length) {
  console.log(`\nS/N ที่พอร์ทัลลงทะเบียนไว้สองระบบ ${moved.length} เครื่อง — เอาตัวที่ Running:`);
  moved.forEach((m) => console.log(`   ${m.sn}  อยู่ที่ ${m.to}\n      ค้างที่ ${m.from.join(", ")}`));
}
console.log(`\n✓ ${OUT} — ${rows.length} แถว`);
console.log("\nนำเข้าด้วย (ทดลองก่อน แล้วค่อยใส่ --apply):");
console.log(`   node scripts/import-xlsx.mjs ${OUT}`);
