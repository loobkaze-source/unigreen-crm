/**
 * Renames customers to confirmed names, merging into an existing record when
 * the CRM already holds that company under the new name.
 *
 *   node scripts/rename-companies.mjs --export   # sheet of the ones to fix
 *   … fill in the ชื่อไทยที่ถูกต้อง column …
 *   node scripts/rename-companies.mjs            # dry run
 *   node scripts/rename-companies.mjs --apply    # rename / merge
 *
 *   node scripts/rename-companies.mjs --merge-dupes           # customers already sharing a name
 *   node scripts/rename-companies.mjs --merge-dupes --apply
 *
 * Renaming alone is not always enough. Tatsuno was in the CRM twice — in Thai
 * from one source with its customer code and contact, in English from another
 * with the site — so the two had to become one. Where a record already exists
 * under the new name, sites, contacts and contracts move to it and the emptied
 * duplicate goes; where none does, it is a plain rename that keeps the record's
 * own code, tax id and history.
 *
 * Only the sheet decides. Nothing is renamed that was left blank.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { readSheet } from "./xlsx-read.mjs";
import { S, colName, sheetXml, buildXlsx } from "./xlsx-write.mjs";

const args = process.argv.slice(2);
const EXPORT = args.includes("--export");
const APPLY = args.includes("--apply");
const MERGE_DUPES = args.includes("--merge-dupes");
const SHEET = "c:/CRM/import-data/company-names-to-fix.xlsx";
const TAB = "แก้ชื่อ";

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

const companies = await loadAll("companies", "id, name, customer_code, tax_id, phone, address, notes");
const sites = await loadAll("sites", "id, company_id");
const contacts = await loadAll("contacts", "id, company_id");
const contracts = await loadAll("service_contracts", "id, company_id");

const held = (id) => ({
  sites: sites.filter((x) => x.company_id === id).length,
  contacts: contacts.filter((x) => x.company_id === id).length,
  contracts: contracts.filter((x) => x.company_id === id).length,
});

// ---------------------------------------------------------------------------
//  Export
// ---------------------------------------------------------------------------

/** A Thai name written inside the English one — often the real company. */
function thaiInside(name) {
  const paren = /[（(]\s*((?:บริษัท|บจก\.|หจก\.|ห้างหุ้นส่วน)[^)）]*)/.exec(name);
  if (paren) return s(paren[1]);
  const afterCode = /^[A-Z]{2,5}\s+((?:บริษัท|บจก\.|หจก\.|ห้างหุ้นส่วน).+)$/.exec(name);
  if (afterCode) return s(afterCode[1]);
  return "";
}

if (EXPORT) {
  const eng = companies
    .filter((c) => /^[A-Za-z]/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  /**
   * Two rows opening the same way are probably one company. Thai has to stay in
   * the comparison — stripped out, every "OTH …" row reduced to "oth" and the
   * whole group flagged itself as duplicates of each other.
   */
  const head = (n) =>
    norm(n).replace(/[^a-z0-9฀-๿ ]/g, " ").split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
  const heads = new Map();
  for (const c of eng) heads.set(head(c.name), (heads.get(head(c.name)) ?? 0) + 1);

  const COLS = [
    { key: "current", head: "ชื่อปัจจุบัน", width: 50 },
    { key: "fixed", head: "ชื่อไทยที่ถูกต้อง (กรอกตรงนี้)", width: 46, fill: true },
    { key: "suggest", head: "ชื่อไทยที่พบในชื่อเดิม", width: 40 },
    { key: "dupe", head: "อาจซ้ำกับแถวอื่น", width: 18 },
    { key: "holds", head: "ไซต์ / ผู้ติดต่อ / สัญญา", width: 20 },
    { key: "code", head: "customer_code", width: 16, text: true },
    { key: "search", head: "ค้นชื่อในทะเบียน DBD", width: 60 },
  ];

  const data = eng.map((c) => {
    const h = held(c.id);
    return {
      current: c.name,
      fixed: "",
      suggest: thaiInside(c.name),
      dupe: heads.get(head(c.name)) > 1 ? "ซ้ำกับแถวอื่น" : "",
      holds: `${h.sites} / ${h.contacts} / ${h.contracts}`,
      code: c.customer_code ?? "",
      search: `https://datawarehouse.dbd.go.th/searchJuristicInfo?keyword=${encodeURIComponent(c.name)}`,
    };
  });

  const guide = sheetXml({
    cols: [{ width: 112 }],
    rows: [
      { height: 24, cells: [{ v: "ลูกค้าที่ยังใช้ชื่อภาษาอังกฤษ", s: S.TITLE }] },
      { cells: [] },
      ...[
        "กรอกเฉพาะคอลัมน์ “ชื่อไทยที่ถูกต้อง” (หัวสีส้ม) แถวไหนที่ยังไม่แน่ใจให้เว้นว่าง ระบบจะไม่แตะแถวนั้น",
        "ถ้าชื่อไทยที่กรอกตรงกับลูกค้าที่มีอยู่แล้ว ระบบจะ “รวมระเบียน” ให้ — ย้ายไซต์/ผู้ติดต่อ/สัญญาไปรวม แล้วลบตัวซ้ำ",
        "ถ้ายังไม่มีลูกค้าชื่อนั้น จะเป็นการเปลี่ยนชื่ออย่างเดียว รหัสลูกค้าและเลขภาษีของเดิมยังอยู่ครบ",
        "คอลัมน์ “ชื่อไทยที่พบในชื่อเดิม” คือชื่อไทยที่แอบอยู่ในวงเล็บหรือหลังรหัสย่อ — คัดลอกไปใช้ได้ถ้าถูก",
        "คอลัมน์ “อาจซ้ำกับแถวอื่น” หมายถึงมีแถวอื่นในไฟล์นี้ที่ขึ้นต้นเหมือนกัน น่าจะเป็นบริษัทเดียวกัน",
        "คอลัมน์ “ไซต์ / ผู้ติดต่อ / สัญญา” บอกว่าระเบียนนั้นถืออะไรอยู่ ยิ่งเยอะยิ่งต้องระวังตอนรวม",
        "",
        "กรอกเสร็จแล้วเซฟ ปิด Excel แล้วรัน:",
        "   node scripts/rename-companies.mjs           (ดูก่อนว่าจะเกิดอะไร)",
        "   node scripts/rename-companies.mjs --apply   (เขียนจริง)",
      ].map((t) => ({ cells: [{ v: t, s: S.NOTE }] })),
    ],
  });

  writeFileSync(
    SHEET,
    buildXlsx([
      {
        name: TAB,
        xml: sheetXml({
          cols: COLS.map((c) => ({ width: c.width, style: c.text ? S.TEXT : undefined })),
          rows: [
            { height: 34, cells: COLS.map((c) => ({ v: c.head, s: c.fill ? S.HEAD_REQ : S.HEAD_OPT })) },
            ...data.map((d) => ({
              cells: COLS.map((c) => ({ v: d[c.key], s: c.text ? S.TEXT : S.WRAP })),
            })),
          ],
          freezeRows: 1,
          autoFilter: `A1:${colName(COLS.length)}1`,
        }),
      },
      { name: "วิธีใช้", xml: guide },
    ])
  );

  console.log(`✓ ${SHEET}`);
  console.log(`   ${data.length} แถวให้แก้`);
  console.log(`   มีชื่อไทยแฝงอยู่ในชื่อเดิม ${data.filter((d) => d.suggest).length} แถว · น่าจะซ้ำกันเอง ${data.filter((d) => d.dupe).length} แถว`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
//  Merge customers that already share a name
// ---------------------------------------------------------------------------

if (MERGE_DUPES) {
  const groups = new Map();
  for (const c of companies) {
    const k = norm(c.name);
    (groups.get(k) ?? groups.set(k, []).get(k)).push(c);
  }
  const dupes = [...groups.values()].filter((g) => g.length > 1);

  console.log(APPLY ? "โหมด: เขียนจริง" : "โหมด: ทดลอง — ใส่ --apply เพื่อเขียน");
  console.log(`ชื่อที่ซ้ำกัน: ${dupes.length} กลุ่ม\n`);

  /**
   * The record to keep is the one the business can be identified by: a tax id
   * first, then a customer code, then whatever holds the most, then the oldest.
   */
  const rank = (c) =>
    (c.tax_id ? 8 : 0) + (c.customer_code ? 4 : 0) +
    (held(c.id).sites + held(c.id).contacts + held(c.id).contracts > 0 ? 2 : 0);

  let done = 0;
  for (const g of dupes) {
    const [keep, ...drop] = [...g].sort((a, b) => rank(b) - rank(a));
    const k = held(keep.id);
    console.log(`${keep.name}`);
    console.log(`   เก็บ: tax=${keep.tax_id ?? "—"} code=${keep.customer_code ?? "—"} · ไซต์ ${k.sites} · ผู้ติดต่อ ${k.contacts}`);

    for (const d of drop) {
      const h = held(d.id);
      console.log(`   รวม: tax=${d.tax_id ?? "—"} code=${d.customer_code ?? "—"} · ไซต์ ${h.sites} · ผู้ติดต่อ ${h.contacts}`);
      if (!APPLY) continue;

      let failed = false;
      for (const [table, rows] of [["sites", sites], ["contacts", contacts], ["service_contracts", contracts]]) {
        const ids = rows.filter((x) => x.company_id === d.id).map((x) => x.id);
        if (!ids.length) continue;
        const { error } = await sb
          .from(table).update({ company_id: keep.id }).in("id", ids).eq("org_id", ORG.id);
        if (error) { failed = true; console.log(`      ✗ ย้าย ${table} — ${error.message}`); }
        else {
          rows.filter((x) => x.company_id === d.id).forEach((x) => (x.company_id = keep.id));
          console.log(`      ✓ ย้าย ${table} ${ids.length} แถว`);
        }
      }
      if (failed) { console.log("      – ไม่ลบ เพราะย้ายข้อมูลไม่ครบ"); continue; }

      // Fields the duplicate had and the keeper does not would otherwise be
      // lost with it, so they are written down before it goes.
      const carried = [
        !keep.tax_id && d.tax_id ? ["tax_id", d.tax_id] : null,
        !keep.customer_code && d.customer_code ? ["customer_code", d.customer_code] : null,
      ].filter(Boolean);
      const noted = [
        d.address && norm(d.address) !== norm(keep.address) ? `ที่อยู่จากระเบียนซ้ำ: ${d.address}` : "",
        d.phone && norm(d.phone) !== norm(keep.phone) ? `โทรจากระเบียนซ้ำ: ${d.phone}` : "",
      ].filter(Boolean);

      if (carried.length || noted.length) {
        const patch = Object.fromEntries(carried);
        if (noted.length) patch.notes = [keep.notes, ...noted].filter(Boolean).join("\n");
        const { error } = await sb.from("companies").update(patch).eq("id", keep.id).eq("org_id", ORG.id);
        if (error) console.log(`      ✗ ย้ายข้อมูลที่ขาด — ${error.message}`);
        else console.log(`      ✓ เก็บข้อมูลจากตัวซ้ำไว้ (${[...carried.map(([f]) => f), ...noted.map((n) => n.split(":")[0])].join(", ")})`);
      }

      const { error } = await sb.from("companies").delete().eq("id", d.id).eq("org_id", ORG.id);
      if (error) console.log(`      ✗ ลบไม่ได้ — ${error.message}`);
      else done++;
    }
  }
  console.log(APPLY ? `\n✓ รวมระเบียนซ้ำแล้ว ${done}` : "\nยังไม่ได้เขียนอะไร — รันซ้ำด้วย --apply");
  process.exit(0);
}

// ---------------------------------------------------------------------------
//  Rename / merge from the sheet
// ---------------------------------------------------------------------------

if (!existsSync(SHEET)) {
  console.error(`ไม่พบ ${SHEET} — รันด้วย --export ก่อน`);
  process.exit(1);
}

const review = readSheet(SHEET, TAB);
const rh = (review.rows[0] ?? []).map(s);
const jobs = [];
for (const r of review.rows.slice(1)) {
  const o = Object.fromEntries(rh.map((k, i) => [k, s(r[i])]));
  const from = o["ชื่อปัจจุบัน"];
  const to = o["ชื่อไทยที่ถูกต้อง (กรอกตรงนี้)"];
  if (from && to && norm(from) !== norm(to)) jobs.push([from, to]);
}

console.log(APPLY ? "โหมด: เขียนจริง" : "โหมด: ทดลอง — ใส่ --apply เพื่อเขียน");
console.log(`กรอกมา ${jobs.length} แถว\n`);

let renamed = 0;
let merged = 0;
for (const [from, to] of jobs) {
  const src = companies.find((c) => norm(c.name) === norm(from));
  if (!src) {
    console.log(`— ไม่พบ “${from.slice(0, 50)}” (อาจแก้ไปแล้ว)`);
    continue;
  }
  const dst = companies.find((c) => c.id !== src.id && norm(c.name) === norm(to));
  const h = held(src.id);

  if (!dst) {
    console.log(`เปลี่ยนชื่อ: ${src.name.slice(0, 48)}\n         → ${to.slice(0, 48)}   (ไซต์ ${h.sites} · ผู้ติดต่อ ${h.contacts})`);
    // Carry the new name locally either way: two rows can rename to the same
    // thing, and the second is then a merge into the first. A dry run that
    // skipped this would promise two renames and deliver a rename and a merge.
    src.name = to;
    if (!APPLY) continue;
    const { error } = await sb.from("companies").update({ name: to }).eq("id", src.id).eq("org_id", ORG.id);
    if (error) console.log(`   ✗ ${error.message}`);
    else renamed++;
    continue;
  }

  const d = held(dst.id);
  console.log(
    `รวมระเบียน: ${src.name.slice(0, 48)}  (ไซต์ ${h.sites} · ผู้ติดต่อ ${h.contacts} · สัญญา ${h.contracts})\n` +
    `         → ${dst.name.slice(0, 48)}  (ไซต์ ${d.sites} · ผู้ติดต่อ ${d.contacts} · code=${dst.customer_code ?? "—"})`
  );
  if (!APPLY) continue;

  let failed = false;
  for (const [table, rows] of [["sites", sites], ["contacts", contacts], ["service_contracts", contracts]]) {
    const ids = rows.filter((x) => x.company_id === src.id).map((x) => x.id);
    if (!ids.length) continue;
    const { error } = await sb
      .from(table).update({ company_id: dst.id }).in("id", ids).eq("org_id", ORG.id);
    if (error) {
      failed = true;
      console.log(`   ✗ ย้าย ${table} ไม่ได้ — ${error.message}`);
    } else {
      rows.filter((x) => x.company_id === src.id).forEach((x) => (x.company_id = dst.id));
      console.log(`   ✓ ย้าย ${table} ${ids.length} แถว`);
    }
  }
  // Only remove the duplicate once everything it held has moved.
  if (failed) {
    console.log("   – ไม่ลบระเบียนซ้ำ เพราะย้ายข้อมูลไม่ครบ");
    continue;
  }
  const { error } = await sb.from("companies").delete().eq("id", src.id).eq("org_id", ORG.id);
  if (error) console.log(`   ✗ ลบระเบียนซ้ำไม่ได้ — ${error.message}`);
  else merged++;
}

if (APPLY) console.log(`\n✓ เปลี่ยนชื่อ ${renamed} · รวมระเบียน ${merged}`);
else console.log("\nยังไม่ได้เขียนอะไร — รันซ้ำด้วย --apply");
