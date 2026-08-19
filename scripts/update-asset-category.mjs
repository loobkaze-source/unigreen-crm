/**
 * Sets each asset's ชนิดเครื่อง from the legacy asset list.
 *
 *   node scripts/update-asset-category.mjs import-data/asset-3-assets.xlsx
 *   node scripts/update-asset-category.mjs import-data/asset-3-assets.xlsx --apply
 *
 * The old system's ประเภทเครื่องจักร / อุปกรณ์ column says what a machine is —
 * Probe, Liquid Sensor, Nozzle (หัวฉีด). The first import had to squeeze that
 * into a six-value enum, so all but a handful landed as "อื่นๆ" and the column
 * that said what the machine actually was went nowhere. Migration 0034 made
 * category free text; this fills it in.
 *
 * Matching is on asset_tag alone. It is unique across all 5,815 rows, whereas
 * going through the site would have to resolve names that have since moved on —
 * a station picked up its code, a customer prefix came off another — and a site
 * that failed to resolve would insert a second copy of an asset that is already
 * there rather than update it. One field changes; nothing else is touched.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { readSheet } from "./xlsx-read.mjs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const file = args.find((a) => !a.startsWith("--"));

if (!file) {
  console.error("ใช้: node scripts/update-asset-category.mjs <asset-3-assets.xlsx> [--apply]");
  process.exit(1);
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

const s = (v) => String(v ?? "").trim();
const { data: orgs } = await sb.from("organizations").select("id, name");
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

const sheet = readSheet(file);
const head = (sheet.rows[0] ?? []).map(s);
const wanted = new Map(); // asset_tag -> category
for (const r of sheet.rows.slice(1)) {
  const row = Object.fromEntries(head.map((k, i) => [k, s(r[i])]));
  if (row.asset_tag && row.category) wanted.set(row.asset_tag, row.category);
}

const equipment = await loadAll("equipment", "id, asset_tag, name, category");

const changes = [];
const same = [];
const unmatched = [];
for (const eq of equipment) {
  const to = eq.asset_tag ? wanted.get(eq.asset_tag) : undefined;
  if (!to) {
    if (eq.asset_tag) unmatched.push(eq);
    continue;
  }
  if (eq.category === to) same.push(eq);
  else changes.push({ eq, to });
}

console.log(`ไฟล์: ${file}`);
console.log(`เลขครุภัณฑ์ในไฟล์ ${wanted.size} · asset ในระบบ ${equipment.length}`);
console.log(`จะแก้ ${changes.length} · ตรงอยู่แล้ว ${same.length} · ไม่มีในไฟล์ ${unmatched.length}`);
console.log(APPLY ? "โหมด: เขียนจริง\n" : "โหมด: ทดลอง — ใส่ --apply เพื่อเขียน\n");

const tally = new Map();
for (const c of changes) tally.set(c.to, (tally.get(c.to) ?? 0) + 1);
console.log("ชนิดที่จะตั้งให้ (10 อันดับแรก):");
[...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  .forEach(([k, n]) => console.log(`   ${String(n).padStart(5)}  ${k}`));
console.log(`   … รวม ${tally.size} ชนิด`);

if (!APPLY) {
  console.log("\nยังไม่ได้เขียนอะไร — รันซ้ำด้วย --apply");
  process.exit(0);
}

// One statement per distinct kind rather than per asset: 68 round trips, not 5,700.
let done = 0;
for (const [category, _] of tally) {
  const ids = changes.filter((c) => c.to === category).map((c) => c.eq.id);
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { error } = await sb
      .from("equipment").update({ category }).in("id", chunk).eq("org_id", ORG.id);
    if (error) console.log(`   ✗ ${category} — ${error.message}`);
    else done += chunk.length;
  }
}
console.log(`\n✓ ตั้งชนิดเครื่องแล้ว ${done}/${changes.length} asset`);
