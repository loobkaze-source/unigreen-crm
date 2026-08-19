/**
 * Repoints sites that were filed under a mis-parsed customer, then removes the
 * customers left empty.
 *
 *   node scripts/repair-asset-customers.mjs import-data/asset-2-sites.xlsx
 *   node scripts/repair-asset-customers.mjs import-data/asset-2-sites.xlsx --apply
 *
 * The first asset import ran with a parser that missed several brand spellings,
 * so 44 sites were filed under customers whose names were really a brand plus a
 * station — "Bangchak หจก.นครพาทรัพย์เจริญ จำกัด 243 เวียง" and the like.
 *
 * Re-importing would not fix it: the corrected sheet names a different customer
 * for the same site, and the loader matches a site by customer and name, so it
 * would insert a second copy rather than move the first. Hence this repair.
 *
 * Every site records the original location string in its notes, and the
 * regenerated sheet says what that string should now resolve to — which is what
 * pairs a site up with the customer it belongs to, without re-parsing anything.
 *
 * Nothing is deleted that still holds anything: a customer goes only when it has
 * no sites, contacts or contracts left, and only if this import created it.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { readSheet } from "./xlsx-read.mjs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const sheetPath = args.find((a) => !a.startsWith("--"));

if (!sheetPath) {
  console.error("ใช้: node scripts/repair-asset-customers.mjs <asset-2-sites.xlsx> [--apply]");
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
const foldSaraAm = (v) => v.replace(/ํา/g, "ำ").replace(/ໍາ/g, "ຳ");
const norm = (v) => foldSaraAm(s(v).replace(/\s+/g, " ").toLowerCase());

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

// ---- what each original location string should resolve to now ---------------
const sheet = readSheet(sheetPath);
const h = (sheet.rows[0] ?? []).map(s);
const ORIGINAL = /ข้อความเดิมจากระบบเก่า:\s*(.+)/;

const wanted = new Map(); // original location string -> correct company name
const wantedRow = new Map(); // …and the whole row, for the name
for (const r of sheet.rows.slice(1)) {
  const row = Object.fromEntries(h.map((k, i) => [k, s(r[i])]));
  const m = ORIGINAL.exec(row.notes ?? "");
  if (!m) continue;
  if (row.company_name) wanted.set(norm(m[1]), row.company_name);
  if (row.name) wantedRow.set(norm(m[1]), row);
}

const companies = await loadAll("companies", "id, name, notes");
const sites = await loadAll("sites", "id, name, company_id, notes");
const contacts = await loadAll("contacts", "id, company_id");
const contracts = await loadAll("service_contracts", "id, company_id");

const byId = new Map(companies.map((c) => [c.id, c]));
const byName = new Map();
for (const c of companies) if (!byName.has(norm(c.name))) byName.set(norm(c.name), c);

console.log(`workspace : ${ORG.name}`);
console.log(`ลูกค้า ${companies.length} · ไซต์ ${sites.length}`);
console.log(APPLY ? "โหมด      : เขียนจริง" : "โหมด      : ทดลอง — ใส่ --apply เพื่อเขียน");
console.log();

// ---- sites sitting under the wrong customer ---------------------------------
const moves = [];
const unknown = [];
for (const site of sites) {
  const m = ORIGINAL.exec(site.notes ?? "");
  if (!m) continue; // not from this import
  const want = wanted.get(norm(m[1]));
  if (!want) continue;

  const now = byId.get(site.company_id);
  if (now && norm(now.name) === norm(want)) continue;

  const target = byName.get(norm(want));
  if (!target) {
    unknown.push({ site, want });
    continue;
  }
  moves.push({ site, from: now?.name ?? "(ไม่มี)", to: target });
}

console.log(`ไซต์ที่ต้องย้าย: ${moves.length}`);
for (const mv of moves.slice(0, 50)) {
  console.log(`   ${mv.site.name.slice(0, 40).padEnd(42)} ${mv.from.slice(0, 40)}  →  ${mv.to.name.slice(0, 40)}`);
}
if (moves.length > 50) console.log(`   … อีก ${moves.length - 50} ไซต์`);

if (unknown.length) {
  console.log(`\n⚠ หาลูกค้าปลายทางไม่เจอ ${unknown.length} ไซต์ — ต้องนำเข้าไฟล์ลูกค้าที่แก้แล้วก่อน`);
  unknown.slice(0, 10).forEach((u) => console.log(`   ${u.site.name.slice(0, 40)}  ต้องการ: ${u.want}`));
}

if (APPLY) {
  let done = 0;
  for (const mv of moves) {
    const { error } = await sb
      .from("sites").update({ company_id: mv.to.id }).eq("id", mv.site.id).eq("org_id", ORG.id);
    if (error) console.log(`   ✗ ${mv.site.name} — ${error.message}`);
    else {
      done++;
      mv.site.company_id = mv.to.id; // keep the local view current for the sweep
    }
  }
  console.log(`\n✓ ย้ายไซต์แล้ว ${done}/${moves.length}`);
}

// ---- names that have moved on since the sites were loaded -------------------
/**
 * The converter has been corrected several times since the first load — a brand
 * prefix came off, a station code went on — so a site can be left under a name
 * the converter no longer produces. Renaming keeps the two in step; without it
 * the next import fails to find the site and inserts a second copy.
 *
 * A rename that would collide with another site of the same customer is skipped:
 * two sites sharing a name under one customer is exactly what the loader cannot
 * tell apart.
 */
const renames = [];
const collides = [];
/** Names already spoken for after this pass — current ones, plus what is being renamed to. */
const claimed = new Set(sites.map((x) => `${x.company_id}|${norm(x.name)}`));
for (const site of sites) {
  const m = ORIGINAL.exec(site.notes ?? "");
  if (!m) continue;
  const row = wantedRow.get(norm(m[1]));
  if (!row || norm(row.name) === norm(site.name)) continue;

  // Two sites renaming to the same thing each look fine on their own; the clash
  // only appears once both have moved, so the target has to be claimed as we go.
  const key = `${site.company_id}|${norm(row.name)}`;
  if (claimed.has(key)) {
    collides.push({ site, to: row.name });
    continue;
  }
  claimed.delete(`${site.company_id}|${norm(site.name)}`);
  claimed.add(key);
  renames.push({ site, to: row.name });
}

console.log(`
ชื่อไซต์ที่ต่างจากตัวแปลงตอนนี้: ${renames.length + collides.length}`);
renames.slice(0, 20).forEach((r) => console.log(`   ${r.site.name.slice(0, 44)}
      → ${r.to.slice(0, 50)}`));
if (renames.length > 20) console.log(`   … อีก ${renames.length - 20} ไซต์`);
if (collides.length) {
  console.log(`
⚠ เปลี่ยนชื่อไม่ได้ จะไปชนกับไซต์อื่นของลูกค้าเดียวกัน ${collides.length} แห่ง`);
  collides.forEach((c) => console.log(`   ${c.site.name.slice(0, 44)}  →  ${c.to.slice(0, 44)}`));
}

if (APPLY && renames.length) {
  let n = 0;
  for (const r of renames) {
    const { error } = await sb
      .from("sites").update({ name: r.to }).eq("id", r.site.id).eq("org_id", ORG.id);
    if (error) console.log(`   ✗ ${r.site.name} — ${error.message}`);
    else {
      n++;
      r.site.name = r.to;
    }
  }
  console.log(`
✓ เปลี่ยนชื่อไซต์แล้ว ${n}/${renames.length}`);
}

// ---- customers this import created that now hold nothing --------------------
const CREATED_BY_IMPORT = /ที่มา:\s*รายการ Asset/;
const stillHas = (id) =>
  sites.some((x) => x.company_id === id) ||
  contacts.some((x) => x.company_id === id) ||
  contracts.some((x) => x.company_id === id);

const empties = companies.filter((c) => CREATED_BY_IMPORT.test(c.notes ?? "") && !stillHas(c.id));

console.log(`\nลูกค้าที่ import นี้สร้างไว้และตอนนี้ว่างเปล่า: ${empties.length}`);
empties.slice(0, 60).forEach((c) => console.log(`   ${c.name.slice(0, 76)}`));
if (empties.length > 60) console.log(`   … อีก ${empties.length - 60} ราย`);

if (!APPLY) {
  console.log("\nยังไม่ได้เขียนอะไร — ตรวจรายการข้างบนแล้วรันซ้ำด้วย --apply");
  process.exit(0);
}

let removed = 0;
for (const c of empties) {
  const { error } = await sb.from("companies").delete().eq("id", c.id).eq("org_id", ORG.id);
  if (error) console.log(`   ✗ ลบ ${c.name} ไม่ได้ — ${error.message}`);
  else removed++;
}
console.log(`✓ ลบลูกค้าที่ว่างเปล่าแล้ว ${removed}/${empties.length}`);
