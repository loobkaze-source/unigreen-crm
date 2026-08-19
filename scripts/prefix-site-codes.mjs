/**
 * Puts a station's own code in front of its site name.
 *
 *   node scripts/prefix-site-codes.mjs
 *   node scripts/prefix-site-codes.mjs --apply
 *
 * The legacy asset list numbers every machine at a station from one code —
 * 12658206-1, 12658206-2, … — so the eight digits before the dash identify the
 * station itself, not the machine. Nothing carried that code into the site
 * record, and staff know stations by it, so it goes at the front of the name:
 *
 *   เฉลิมฉลองบริการ  ->  12658206_เฉลิมฉลองบริการ
 *
 * A site whose assets disagree about the code is left alone and reported —
 * guessing which of two is the station would be worse than leaving it be.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

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

const sites = await loadAll("sites", "id, name, company_id");
const companies = await loadAll("companies", "id, name");
const equipment = await loadAll("equipment", "id, site_id, serial_number");
const coName = new Map(companies.map((c) => [c.id, c.name]));

/** 12658206-4 -> 12658206. The machine's number is after the dash. */
const STATION = /^(\d{8})-/;

const codes = new Map(); // site id -> Set of codes seen on its assets
for (const e of equipment) {
  const m = STATION.exec(String(e.serial_number ?? ""));
  if (!m || !e.site_id) continue;
  (codes.get(e.site_id) ?? codes.set(e.site_id, new Set()).get(e.site_id)).add(m[1]);
}

const rename = [];
const ambiguous = [];
const already = [];
for (const site of sites) {
  const found = codes.get(site.id);
  if (!found) continue;
  if (found.size > 1) {
    ambiguous.push({ site, found: [...found] });
    continue;
  }
  const code = [...found][0];
  if (site.name.startsWith(`${code}_`)) {
    already.push(site);
    continue;
  }
  rename.push({ site, code, to: `${code}_${site.name}` });
}

console.log(`ไซต์ทั้งหมด ${sites.length} · มีเลขสถานี ${codes.size}`);
console.log(`จะเติมเลข ${rename.length} · เติมไว้แล้ว ${already.length} · เลขไม่ตรงกัน ${ambiguous.length}`);
console.log(APPLY ? "โหมด: เขียนจริง\n" : "โหมด: ทดลอง — ใส่ --apply เพื่อเขียน\n");

console.log("ตัวอย่าง:");
rename.slice(0, 12).forEach((r) => console.log(`   ${r.site.name.slice(0, 46)}\n      → ${r.to.slice(0, 56)}`));
if (rename.length > 12) console.log(`   … อีก ${rename.length - 12} ไซต์`);

if (ambiguous.length) {
  console.log(`\n⚠ asset ในไซต์เดียวกันมีเลขสถานีไม่ตรงกัน — ข้ามไว้ ${ambiguous.length} ไซต์`);
  ambiguous.forEach((a) =>
    console.log(`   ${a.site.name.slice(0, 44)}  →  ${a.found.join(" / ")}`)
  );
}

/**
 * One code across two sites means the same station was written two ways in the
 * legacy location field and came in twice. The code is better evidence of
 * identity than the name, so it is worth surfacing even though this script does
 * not merge anything.
 */
const owners = new Map();
for (const [siteId, set] of codes) {
  if (set.size !== 1) continue;
  const code = [...set][0];
  (owners.get(code) ?? owners.set(code, []).get(code)).push(siteId);
}
const shared = [...owners.entries()].filter(([, ids]) => ids.length > 1);
if (shared.length) {
  console.log(`\n⚠ เลขสถานีเดียวกันอยู่คนละไซต์ ${shared.length} ชุด — น่าจะเป็นปั๊มเดียวกันที่เข้ามาซ้ำ`);
  shared.slice(0, 15).forEach(([code, ids]) => {
    console.log(`   ${code}`);
    ids.forEach((id) => {
      const s = sites.find((x) => x.id === id);
      console.log(`      ${s.name.slice(0, 50).padEnd(52)} ${coName.get(s.company_id) ?? "—"}`);
    });
  });
  if (shared.length > 15) console.log(`   … อีก ${shared.length - 15} ชุด`);
}

if (!APPLY) {
  console.log("\nยังไม่ได้เขียนอะไร — ตรวจรายการข้างบนแล้วรันซ้ำด้วย --apply");
  process.exit(0);
}

let done = 0;
for (const r of rename) {
  const { error } = await sb
    .from("sites").update({ name: r.to }).eq("id", r.site.id).eq("org_id", ORG.id);
  if (error) console.log(`   ✗ ${r.site.name} — ${error.message}`);
  else done++;
}
console.log(`\n✓ เติมเลขสถานีแล้ว ${done}/${rename.length} ไซต์`);
