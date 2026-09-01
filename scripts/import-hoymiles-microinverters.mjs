/**
 * Gives every Hoymiles micro-inverter its own record.
 *
 *   node scripts/import-hoymiles-microinverters.mjs
 *   node scripts/import-hoymiles-microinverters.mjs --apply
 *
 * The first Hoymiles export counted the micro-inverters without serialising
 * them, so they went in as one row per site saying how many, of what. This
 * export has the serials, so each becomes an asset of its own — which is what
 * makes it possible to raise a job against the unit that actually failed
 * rather than against the string it belongs to.
 *
 * The counted rows are then removed, but only where the count is fully
 * accounted for by real serials and nothing points at them yet. A placeholder
 * that something already refers to is left alone and reported.
 *
 * Dry by default; --apply writes.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { readSheet } from "./xlsx-read.mjs";

const APPLY = process.argv.includes("--apply");
const FILE = "c:/CRM/import-data/Hoymiles_microinverter.xlsx";

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
const up = (v) => clean(v).toUpperCase();

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

// ---------------------------------------------------------------------------
//  The export
// ---------------------------------------------------------------------------
const rows = readSheet(FILE, "Devices")
  .rows.slice(1)
  .filter((r) => clean(r[1]));

const wanted = rows.map((r) => ({
  serial: up(r[1]),
  model: clean(r[2]),
  dtu: up(r[3]),
  site: clean(r[4]),
}));

const dupes = wanted.length - new Set(wanted.map((w) => w.serial)).size;
if (dupes) throw new Error(`ไฟล์มี SN ซ้ำ ${dupes} รายการ — หยุดก่อน`);

// ---------------------------------------------------------------------------
//  What is already here
// ---------------------------------------------------------------------------
const dtus = await all(() =>
  sb.from("equipment").select("id,serial_number,site_id,org_id").eq("brand", "HOYMILES").eq("category", "DTU")
);
const byDtu = new Map(dtus.map((d) => [up(d.serial_number), d]));

const mine = await all(() =>
  sb.from("equipment").select("id,serial_number,name,notes,site_id").eq("brand", "HOYMILES").eq("category", "Inverter")
);
const already = new Set(mine.filter((e) => e.serial_number).map((e) => up(e.serial_number)));
/** The counted stand-ins: an Inverter with no serial of its own. */
const placeholders = mine.filter((e) => !e.serial_number);

const toCreate = [];
const orphans = [];
for (const w of wanted) {
  if (already.has(w.serial)) continue;
  const dtu = byDtu.get(w.dtu);
  if (!dtu) {
    orphans.push(w);
    continue;
  }
  toCreate.push({
    org_id: dtu.org_id,
    site_id: dtu.site_id,
    name: `ไมโครอินเวอร์เตอร์ ${w.model}`,
    category: "Inverter",
    brand: "HOYMILES",
    model: w.model,
    serial_number: w.serial,
    status: "operational",
    notes: `ต่อกับ DTU ${w.dtu}`,
  });
}

/** How many real serials each placeholder is about to be replaced by. */
const perDtu = new Map();
for (const w of wanted) perDtu.set(w.dtu, (perDtu.get(w.dtu) ?? 0) + 1);

// Nothing is deleted while anything still points at it.
const ids = placeholders.map((p) => p.id);
const referenced = new Set();
if (ids.length) {
  for (const [table, col] of [
    ["warranties", "equipment_id"],
    ["work_orders", "asset_id"],
    ["work_order_assets", "equipment_id"],
    ["work_order_parts", "equipment_id"],
    ["cases", "equipment_id"],
    ["case_assets", "equipment_id"],
  ]) {
    const { data, error } = await sb.from(table).select(col).in(col, ids);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const r of data) referenced.add(r[col]);
  }
}

const toDelete = [];
const kept = [];
for (const p of placeholders) {
  const dtu = (p.notes?.match(/DTU ([0-9A-Za-z]+)/) ?? [])[1]?.toUpperCase();
  const counted = Number((p.name.match(/×\s*(\d+)/) ?? [])[1]) || 0;
  const covered = perDtu.get(dtu) ?? 0;
  if (referenced.has(p.id)) kept.push(`${p.name} — มีใบงาน/เคสอ้างถึงอยู่`);
  else if (!dtu || covered < counted)
    kept.push(`${p.name} — นับไว้ ${counted} แต่ไฟล์ให้ SN มา ${covered}`);
  else toDelete.push(p);
}

console.log(`\nไฟล์: ไมโครอินเวอร์เตอร์ ${wanted.length} ตัว · DTU ${perDtu.size} เครื่อง`);
console.log(`สร้างใหม่ ${toCreate.length} · มีอยู่แล้ว ${wanted.length - toCreate.length - orphans.length}`);
if (orphans.length) {
  console.log(`\nหา DTU ไม่เจอ ${orphans.length} ตัว — ข้ามไว้:`);
  for (const o of orphans.slice(0, 10)) console.log(`  ! ${o.serial} → DTU ${o.dtu}`);
}
console.log(`\nแถวรวมกลุ่มที่จะลบทิ้ง ${toDelete.length} · เก็บไว้ ${kept.length}`);
for (const k of kept) console.log(`  = ${k}`);

if (!APPLY) {
  console.log("\n(ทดลองรัน — ใส่ --apply เพื่อบันทึกจริง)");
} else {
  let made = 0;
  for (let i = 0; i < toCreate.length; i += 100) {
    const batch = toCreate.slice(i, i + 100);
    const { error } = await sb.from("equipment").insert(batch);
    if (error) {
      console.error(`  x แถว ${i}–${i + batch.length}: ${error.message}`);
      continue;
    }
    made += batch.length;
  }
  console.log(`\nสร้างอุปกรณ์ ${made} รายการ`);

  if (toDelete.length) {
    const { error } = await sb
      .from("equipment")
      .delete()
      .in("id", toDelete.map((p) => p.id));
    if (error) console.error(`  x ลบแถวรวมกลุ่ม: ${error.message}`);
    else console.log(`ลบแถวรวมกลุ่ม ${toDelete.length} รายการ`);
  }
}
