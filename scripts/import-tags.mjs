/**
 * Seeds the fault / repair / cause vocabulary from the old system's history.
 *
 *   node scripts/import-tags.mjs import-data/tag_history_20260820_230500.xlsx
 *   node scripts/import-tags.mjs import-data/tag_history_20260820_230500.xlsx --apply
 *
 * The sheet is one row per past repair, not a catalogue, so the catalogue is
 * what falls out of it: every code with the description it was written with,
 * and every cause with how often it was written. A code that appears with two
 * different descriptions is reported rather than guessed at — there is one
 * right answer and the file knows it, not this script.
 *
 * Re-runnable: a tag already there has its `uses` updated and nothing else, so
 * running it again after another export adds only what is new.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { readSheet } from "./xlsx-read.mjs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FILE = args.find((a) => !a.startsWith("--"));

if (!FILE) {
  console.error("ใช้: node scripts/import-tags.mjs <tag_history.xlsx> [--apply]");
  process.exit(1);
}

/** Columns as the export names them. */
const COLS = {
  fault: ["รหัสอาการเสีย", "รายละเอียดอาการเสีย"],
  repair: ["รหัสซ่อม", "รายละเอียดการซ่อม"],
  cause: ["สาเหตุของปัญหา", null],
};

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

const s = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const sheet = readSheet(FILE);
const head = (sheet.rows[0] ?? []).map(s);
const rows = sheet.rows.slice(1).map((r) => Object.fromEntries(head.map((k, i) => [k, s(r[i])])));

const missing = Object.values(COLS).flat().filter((c) => c && !head.includes(c));
if (missing.length) throw new Error(`ไฟล์นี้ไม่มีคอลัมน์ ${missing.join(", ")}`);

// ---------------------------------------------------------------------------

const conflicts = [];
const tags = [];

for (const [kind, [codeCol, descCol]] of Object.entries(COLS)) {
  const seen = new Map(); // key -> { code, value, uses, descs }
  for (const row of rows) {
    const code = row[codeCol];
    if (!code) continue;
    const desc = descCol ? row[descCol] : "";
    // A coded tag reads as it does on the report; a cause is its own words.
    const key = descCol ? code : code;
    const hit = seen.get(key) ?? seen.set(key, { code: descCol ? code : null, descs: new Set(), uses: 0 }).get(key);
    hit.uses++;
    if (desc) hit.descs.add(desc);
  }

  for (const [key, hit] of seen) {
    if (hit.descs.size > 1) {
      conflicts.push({ kind, code: key, descs: [...hit.descs] });
      continue;
    }
    const desc = [...hit.descs][0] ?? "";
    tags.push({
      org_id: ORG.id,
      kind,
      code: hit.code,
      value: desc ? `${key} : ${desc}` : key,
      uses: hit.uses,
    });
  }
}

const byKind = (k) => tags.filter((t) => t.kind === k);
console.log(`ไฟล์: ${FILE}  (${rows.length} แถว)`);
console.log(`   รหัสอาการเสีย ${byKind("fault").length} · รหัสซ่อม ${byKind("repair").length} · สาเหตุ ${byKind("cause").length}`);
console.log(APPLY ? "โหมด: เขียนจริง\n" : "โหมด: ทดลอง — ใส่ --apply เพื่อเขียน\n");

for (const k of ["fault", "repair"]) {
  console.log(`${k}:`);
  byKind(k)
    .sort((a, b) => (a.code ?? "").localeCompare(b.code ?? ""))
    .forEach((t) => console.log(`   ${String(t.uses).padStart(4)}  ${t.value}`));
}
console.log("cause (10 อันดับแรก):");
byKind("cause")
  .sort((a, b) => b.uses - a.uses)
  .slice(0, 10)
  .forEach((t) => console.log(`   ${String(t.uses).padStart(4)}  ${t.value.slice(0, 60)}`));

if (conflicts.length) {
  console.log(`\n⚠ รหัสที่มีคำอธิบายมากกว่าหนึ่งแบบ ${conflicts.length} รหัส — ข้ามไว้ ต้องเลือกให้ก่อน`);
  conflicts.forEach((c) => console.log(`   [${c.kind}] ${c.code}\n      ${c.descs.join("\n      ")}`));
}

if (!APPLY) {
  console.log("\nยังไม่ได้เขียนอะไร — รันซ้ำด้วย --apply");
  process.exit(0);
}

let done = 0;
for (let i = 0; i < tags.length; i += 200) {
  const { error } = await sb
    .from("service_tags")
    .upsert(tags.slice(i, i + 200), { onConflict: "org_id,kind,value" });
  if (error) throw new Error(`เขียน service_tags ไม่ได้: ${error.message}`);
  done += tags.slice(i, i + 200).length;
}
console.log(`\n✓ นำเข้าคำศัพท์แล้ว ${done} รายการ`);
