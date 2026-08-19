/**
 * Writes the company names the registry could not settle into a small sheet to
 * be corrected by hand, and reads that sheet back in.
 *
 *   node scripts/export-pending-names.mjs import-data/venio-1-companies.xlsx
 *   … fill in the ชื่อที่ถูกต้อง column …
 *   node scripts/export-pending-names.mjs import-data/venio-1-companies.xlsx --apply
 *
 * Two kinds of row end up here: those the bot filter never let us look up, and
 * those whose number the registry has no record of at all. Both need a person.
 *
 * The ชื่อที่ถูกต้อง column is deliberately left empty. A guess pre-filled into
 * the field someone is meant to check is a guess that gets accepted unread, so
 * suggestions sit in their own column to be copied across only if they are right.
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { readSheet } from "./xlsx-read.mjs";
import { COMPANIES } from "./import-schema.mjs";
import { buildTemplateWorkbook } from "./import-workbook.mjs";
import { S, colName, sheetXml, buildXlsx } from "./xlsx-write.mjs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const file = args.find((a) => !a.startsWith("--"));

if (!file) {
  console.error("ใช้: node scripts/export-pending-names.mjs <ไฟล์ลูกค้า.xlsx> [--apply]");
  process.exit(1);
}

const REVIEW = join(dirname(file), "dbd-pending-names.xlsx");
const CACHE = join(dirname(file), "dbd-cache.json");

const s = (v) => String(v ?? "").trim();
const digits = (v) => s(v).replace(/\D/g, "");
const tight = (v) => s(v).replace(/\s+/g, "").toLowerCase();

const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};

const isJuristic = (v) => digits(v).length === 13 && digits(v).startsWith("0");

const sheet = readSheet(file);
const header = (sheet.rows[0] ?? []).map(s);
const rows = sheet.rows
  .slice(1)
  .map((r) => Object.fromEntries(header.map((k, i) => [k, s(r[i])])))
  .filter((o) => Object.values(o).some(Boolean));

// ---------------------------------------------------------------------------
//  Suggestions — only for patterns seen to be wrong across the checked rows
// ---------------------------------------------------------------------------

/**
 * Of the names the registry did correct, the overwhelmingly common fault was
 * "ห้างหุ้นส่วน X" for the registered "ห้างหุ้นส่วนจำกัด X", so that one is
 * worth offering. Spacing inside the name is not guessable and is left alone.
 */
function suggest(name) {
  const n = s(name);
  if (/^ห้างหุ้นส่วน\s+(?!จำกัด|สามัญ)/.test(n)) return n.replace(/^ห้างหุ้นส่วน\s+/, "ห้างหุ้นส่วนจำกัด ");
  if (/^ห้างหุ้นส่วน\s+จำกัด\s+/.test(n)) return n.replace(/^ห้างหุ้นส่วน\s+จำกัด\s+/, "ห้างหุ้นส่วนจำกัด ");
  if (/^บ\.\s*/.test(n)) return n.replace(/^บ\.\s*/, "บริษัท ") + (/(จำกัด|มหาชน)/.test(n) ? "" : " จำกัด");
  if (/^บริษัท\s/.test(n) && !/(จำกัด|มหาชน)/.test(n)) return `${n} จำกัด`;
  return "";
}

function why(row) {
  const n = s(row.name);
  const out = [];
  if (/^[A-Za-z]/.test(n)) out.push("ชื่อเป็นภาษาอังกฤษ");
  if (!/(จำกัด|มหาชน)/.test(n)) out.push("ไม่มีคำว่าจำกัด/มหาชน");
  if (/^(ปตท\.|PTT|Shell|BCP|ESSO|PT )/i.test(n)) out.push("ขึ้นต้นด้วยชื่อแบรนด์");
  if (/\((สำนักงานใหญ่|สนญ|สาขา)/.test(n)) out.push("มีวงเล็บสาขา");
  if (/ {2,}/.test(n)) out.push("เว้นวรรคซ้ำ");
  return out.join(" · ");
}

const pending = rows
  .filter((r) => isJuristic(r.tax_id))
  .map((r) => {
    const hit = cache[digits(r.tax_id)];
    if (!hit) return { row: r, state: "ยังไม่ได้ตรวจ (ทะเบียนบล็อก)" };
    if (hit.notFound) return { row: r, state: "ทะเบียนไม่พบเลขนี้ — ตรวจเลขด้วย" };
    return null;
  })
  .filter(Boolean);

// ---------------------------------------------------------------------------

const COLS = [
  { key: "tax_id", head: "tax_id", width: 18, text: true },
  { key: "current", head: "ชื่อปัจจุบันในไฟล์", width: 46 },
  { key: "fixed", head: "ชื่อที่ถูกต้อง (กรอกตรงนี้)", width: 46, fill: true },
  { key: "suggest", head: "ข้อเสนอแนะ (คัดลอกไปใช้ได้ถ้าถูก)", width: 46 },
  { key: "why", head: "ทำไมต้องตรวจ", width: 30 },
  { key: "state", head: "สถานะ", width: 28 },
  { key: "link", head: "ลิงก์ตรวจทะเบียน", width: 56 },
];

if (!APPLY) {
  const data = pending.map(({ row, state }) => ({
    tax_id: s(row.tax_id),
    current: s(row.name),
    fixed: "",
    suggest: suggest(row.name),
    why: why(row),
    state,
    link: `https://openapi.dbd.go.th/api/v1/juristic_person/${digits(row.tax_id)}`,
  }));

  const head = {
    height: 34,
    cells: COLS.map((c) => ({ v: c.head, s: c.fill ? S.HEAD_REQ : S.HEAD_OPT })),
  };
  const body = data.map((d) => ({
    cells: COLS.map((c) => ({ v: d[c.key], s: c.text ? S.TEXT : S.WRAP })),
  }));

  const guide = sheetXml({
    cols: [{ width: 110 }],
    rows: [
      { height: 24, cells: [{ v: "รายชื่อลูกค้าที่ต้องแก้ชื่อด้วยตัวเอง", s: S.TITLE }] },
      { cells: [] },
      ...[
        "กรอกเฉพาะคอลัมน์ “ชื่อที่ถูกต้อง” (หัวสีส้ม) — คอลัมน์อื่นมีไว้อ่านประกอบ ห้ามลบคอลัมน์ tax_id",
        "แถวไหนที่ชื่อปัจจุบันถูกอยู่แล้ว ให้เว้นว่างไว้ ระบบจะไม่แตะแถวนั้น",
        "“ข้อเสนอแนะ” เป็นการเดาจากรูปแบบที่พบบ่อย ไม่ได้ยืนยันกับทะเบียน — ถ้าเห็นว่าถูกให้คัดลอกไปใส่ช่องชื่อที่ถูกต้อง",
        "เปิดลิงก์ในคอลัมน์สุดท้ายจะเห็นข้อมูลจากทะเบียนกรมพัฒนาธุรกิจการค้าโดยตรง ดูที่ค่า OrganizationJuristicNameTH",
        "แถวที่สถานะเป็น “ทะเบียนไม่พบเลขนี้” แปลว่าเลขผู้เสียภาษีน่าจะกรอกผิด ควรแก้ที่ไฟล์ลูกค้าหลักด้วย",
        "",
        "กรอกเสร็จแล้วเซฟ ปิด Excel แล้วรัน:",
        "   node scripts/export-pending-names.mjs import-data/venio-1-companies.xlsx --apply",
      ].map((t) => ({ cells: [{ v: t, s: S.NOTE }] })),
    ],
  });

  writeFileSync(
    REVIEW,
    buildXlsx([
      {
        name: "แก้ชื่อ",
        xml: sheetXml({
          cols: COLS.map((c) => ({ width: c.width, style: c.text ? S.TEXT : undefined })),
          rows: [head, ...body],
          freezeRows: 1,
          autoFilter: `A1:${colName(COLS.length)}1`,
        }),
      },
      { name: "วิธีใช้", xml: guide },
    ])
  );

  const withSuggest = data.filter((d) => d.suggest).length;
  console.log(`✓ ${REVIEW}`);
  console.log(`   ${data.length} แถวให้แก้  (มีข้อเสนอแนะให้แล้ว ${withSuggest} แถว)`);
  console.log(
    `   ยังไม่ได้ตรวจ ${pending.filter((p) => p.state.startsWith("ยังไม่")).length} · ` +
    `ทะเบียนไม่พบเลข ${pending.filter((p) => !p.state.startsWith("ยังไม่")).length}`
  );
  process.exit(0);
}

// ---- apply -----------------------------------------------------------------

if (!existsSync(REVIEW)) {
  console.error(`ไม่พบ ${REVIEW} — รันโดยไม่ใส่ --apply ก่อนเพื่อสร้างไฟล์`);
  process.exit(1);
}
try {
  appendFileSync(file, "");
} catch (e) {
  console.error(`\n✗ เขียนทับ ${file} ไม่ได้ (${e.code}) — ปิดไฟล์ใน Excel ก่อน`);
  process.exit(1);
}

const review = readSheet(REVIEW, "แก้ชื่อ");
const rh = (review.rows[0] ?? []).map(s);
const fixes = new Map();
for (const r of review.rows.slice(1)) {
  const o = Object.fromEntries(rh.map((k, i) => [k, s(r[i])]));
  const tax = digits(o["tax_id"]);
  const fixed = s(o["ชื่อที่ถูกต้อง (กรอกตรงนี้)"]);
  if (tax && fixed) fixes.set(tax, fixed);
}

let changed = 0;
let same = 0;
for (const row of rows) {
  const fixed = fixes.get(digits(row.tax_id));
  if (!fixed) continue;
  if (tight(fixed) === tight(row.name)) {
    same++;
    continue;
  }
  row.notes = [row.notes, `ชื่อเดิมในไฟล์นำเข้า: ${row.name}`].filter(Boolean).join("\n");
  row.name = fixed;
  changed++;
}

writeFileSync(
  file,
  buildTemplateWorkbook(COMPANIES, rows, [
    "ชื่อบางแถวแก้ด้วยมือจาก dbd-pending-names.xlsx — ชื่อเดิมเก็บไว้ในช่อง notes",
  ])
);
console.log(`✓ เขียนทับ ${file} แล้ว — แก้ชื่อ ${changed} แถว` + (same ? ` (อีก ${same} แถวกรอกมาตรงกับของเดิม)` : ""));
