/**
 * Puts "PTT Station" in front of named sites.
 *
 *   node scripts/prefix-ptt-sites.mjs
 *   node scripts/prefix-ptt-sites.mjs --apply
 *
 * A list, not a pattern. Matching on "ปตท" across the whole table caught 126
 * sites, most of them already called "สน.ปตท.…" and none of them asked for, so
 * this only ever touches the names written below. Adding a site to the list is
 * how it gets the prefix.
 *
 * The contract and warranty titles carry the site name inside them, so they are
 * rewritten with it. Dry by default; --apply writes. Re-runnable: a name that
 * already leads with the prefix is left alone.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const PREFIX = "PTT Station ";

/**
 * The sites to prefix, exactly as they are spelt in the database.
 *
 * The Hoymiles solar plants came first; the eleven below are the fuel-side
 * stations the user pointed at afterwards. Every one is a shop, a café or a
 * forecourt at a PTT station — which is what a technician needs to know before
 * driving there.
 */
const SITES = [
  // Hoymiles solar plants.
  "Amazon โคกศรี",
  "Amazon ปตท.แยกกาฬสินธุ์",
  "บจ.ดี เอนเนอร์จี แอนด์ รีเทล ปตท. U-Park",
  "บจ.ปทุมพฤกษรักษ์ ปิโตรเลี่ยม (7-11) ปตท.พลูตาหลวง",
  "บจ.ปทุมพฤกษรักษ์ ปิโตรเลี่ยม (PTT) ปตท.พลูตาหลวง",
  "บจ.พี.เอส.วาย. ปิโตรเลียม (Office) ปตท.ท่าพระ",
  "บจ.พี.เอส.วาย. ปิโตรเลียม (ธุรกิจเสริม) ปตท.ท่าพระ",
  "บจ.ลำพูนแฮปปี้ออยล์ ปตท.เหมืองง่า จ.ลำพูน",
  "หจก. นภาออยล์ (Café Amazon โพนทอง)",
  "หจก.พนาพนธ์เชียงใหม่ (7-11) ปตท.หางดง",
  "หจก.พนาพนธ์เชียงใหม่ (PTT Station) ปตท.หางดง",
  "หจก.พนาพนธ์เชียงใหม่ (ร้านพิซซ่า) ปตท.หางดง",
  "หจก.เอ แอนด์ เอส ออยล์ (PTT) ปตท.ดงสันเงิน ลำปาง",
  // The fuel side.
  "7-11 ปตท.เกษตรวิสัย",
  "7-Eleven สาขา PTTOR น้ำชุน (หล่มสัก) (10169)",
  "บจ. ธนโชติชัยการปิโตรเลียม (7-Eleven วังมะนาว)",
  "บจ. ธนโชติชัยการปิโตรเลียม (PTT Station วังมะนาว)",
  "บจ. ธนโชติชัยการปิโตรเลียม (บ้านคุณจรรยา) ปตท. วังมะนาว ขาเข้า",
  "บจ. พรรณ์วิภา เทรดดิ้ง (7-11) ปตท. จันทร์ศรีพร้าว",
  "บจ.ธนวิน 24 (7-11) ปตท. ธนวิน24",
  "บจ.ธนวิน 24 (PTT Station) ปตท. ธนวิน24",
  "บจ.ปทุมพฤกษรักษ์ ออยล์ (บ้านคุณเล็ก) ปตท. แยกเกษมพล",
  "บจ.มิลเลี่ยน รีเทล (7-Eleven) ปตท.ร่มเกล้า-สุวรรณภูมิ",
  "บริษัท อัครปิโตเลียม จำกัด(ปตท.สะพานพระราม 5)",
];

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

const wanted = new Set(SITES);
const prefixed = new Set(SITES.map((n) => PREFIX + n));
const sites = await all(() => sb.from("sites").select("id, name"));

const renames = sites
  .filter((s) => wanted.has(s.name))
  .map((s) => ({ id: s.id, from: s.name, to: PREFIX + s.name }));
const done = sites.filter((s) => prefixed.has(s.name)).length;
// A name on the list that matches nothing is a typo, and saying so is the
// whole point of writing the list out by hand.
const missing = SITES.filter(
  (n) => !sites.some((s) => s.name === n || s.name === PREFIX + n)
);

const ids = renames.map((r) => r.id);
const [contracts, warranties] = ids.length
  ? await Promise.all([
      all(() => sb.from("service_contracts").select("id, title, site_id").in("site_id", ids)),
      all(() => sb.from("warranties").select("id, title, site_id").in("site_id", ids)),
    ])
  : [[], []];
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

console.log(`\nในรายการ ${SITES.length} · มีคำนำหน้าแล้ว ${done} · จะเปลี่ยนชื่อ ${renames.length}`);
for (const r of renames) console.log(`  + ${r.to}`);
if (missing.length) {
  console.log("\nหาไม่เจอในระบบ (ชื่อสะกดไม่ตรง?):");
  for (const m of missing) console.log(`  ! ${m}`);
}
console.log(`\nชื่อสัญญาที่แก้ตาม ${contractTitles.length} · ชื่อการรับประกัน ${warrantyTitles.length}`);

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
      if (error) console.error(`  x ${table}: ${error.message}`);
      else m++;
    }
    console.log(`แก้ชื่อใน ${table} ${m} รายการ`);
  }
}
