/**
 * Puts "PTT Station" in front of the sites that are one.
 *
 *   node scripts/prefix-ptt-sites.mjs
 *   node scripts/prefix-ptt-sites.mjs --apply
 *
 * The Hoymiles export names a plant after whatever building it stands on —
 * "บจ.ปทุมพฤกษรักษ์ ปิโตรเลี่ยม (7-11) ปตท.พลูตาหลวง" — so eleven petrol
 * stations sit scattered down an alphabetical list between a bicycle shop and
 * a block of flats. The prefix puts them together and says what they are at a
 * glance.
 *
 * A site is one if its own name says ปตท./PTT, or Café Amazon — PTT's own
 * brand, and in this fleet always on a forecourt. That takes the shop and the
 * café with it, which is right: they are at a PTT station, and that is what a
 * technician needs to know before driving there.
 *
 * The contract and warranty titles carry the site name inside them, so they are
 * rewritten with it. Dry by default; --apply writes. Re-runnable: a name that
 * already starts with the prefix is left alone.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const PREFIX = "PTT Station ";
/**
 * Its own name has to say so — ปตท./PTT, or Café Amazon, which is PTT's own
 * brand and in this fleet is always on a forecourt. Shell is not: กรีนออยล์
 * Shell GOP Chaiya is a petrol station and keeps its own name.
 */
const isStation = (name) => /ปตท|ptt|amazon|อเมซอน/i.test(name);

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

async function all(query) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

// Only the solar sites. The fuel side named its own stations years ago and is
// not this script's business.
const hoymiles = await all(() =>
  sb.from("equipment").select("site_id").eq("brand", "HOYMILES")
);
const siteIds = [...new Set(hoymiles.map((e) => e.site_id).filter(Boolean))];
const sites = await all(() => sb.from("sites").select("id, name").in("id", siteIds));

const renames = sites
  .filter((s) => isStation(s.name) && !s.name.startsWith(PREFIX))
  .map((s) => ({ id: s.id, from: s.name, to: PREFIX + s.name }));

const [contracts, warranties] = await Promise.all([
  all(() => sb.from("service_contracts").select("id, title, site_id").in("site_id", siteIds)),
  all(() => sb.from("warranties").select("id, title, site_id").in("site_id", siteIds)),
]);
const byId = new Map(renames.map((r) => [r.id, r]));
const retitle = (rows) =>
  rows
    .map((r) => {
      const rename = byId.get(r.site_id);
      if (!rename || !r.title.includes(rename.from)) return null;
      return { id: r.id, from: r.title, to: r.title.replace(rename.from, rename.to) };
    })
    .filter(Boolean);
const contractTitles = retitle(contracts);
const warrantyTitles = retitle(warranties);

console.log(`\nไซต์โซลาร์ ${sites.length} แห่ง · เป็นปั๊ม ปตท. ที่ยังไม่มีคำนำหน้า ${renames.length}`);
for (const r of renames) console.log(`  ${r.from}\n   → ${r.to}`);
console.log(`\nชื่อสัญญาที่ต้องแก้ตาม ${contractTitles.length} · ชื่อการรับประกัน ${warrantyTitles.length}`);

if (!APPLY) {
  console.log("\n(ทดลองรัน — ใส่ --apply เพื่อบันทึกจริง)");
} else {
  let n = 0;
  for (const r of renames) {
    const { error } = await sb.from("sites").update({ name: r.to }).eq("id", r.id);
    if (error) console.error(`  x ${r.from}: ${error.message}`);
    else n++;
  }
  console.log(`\nเปลี่ยนชื่อไซต์ ${n} แห่ง`);

  for (const [table, list] of [
    ["service_contracts", contractTitles],
    ["warranties", warrantyTitles],
  ]) {
    let m = 0;
    for (const t of list) {
      const { error } = await sb.from(table).update({ title: t.to }).eq("id", t.id);
      if (error) console.error(`  x ${table} ${t.from}: ${error.message}`);
      else m++;
    }
    console.log(`แก้ชื่อใน ${table} ${m} รายการ`);
  }
}
