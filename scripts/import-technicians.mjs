/**
 * Updates the technician records from the UWS import form.
 *
 *   node scripts/import-technicians.mjs "import-data/แบบฟอร์ม_Import_ช่างเทคนิค_UWS ….xlsx"
 *   node scripts/import-technicians.mjs "…" --apply
 *
 * The sheet is one row per technician with a ✓ under every skill and every
 * certificate they hold. It carries no login and this script writes none: a
 * technician is found by name, and `user_id` — the account, and so the
 * username — is never in a payload and never touched.
 *
 * Dry by default; --apply writes. Re-runnable, because every write is the
 * whole row rather than a delta: running it twice leaves the same thing behind.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { readSheet } from "./xlsx-read.mjs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FILE = args.find((a) => !a.startsWith("--"));

if (!FILE) {
  console.error('ใช้: node scripts/import-technicians.mjs "<แบบฟอร์ม.xlsx>" [--apply]');
  process.exit(1);
}

/** The header row, and the first row of technicians under it. */
const HEADER_ROW = 5;
const FIRST_DATA_ROW = 6;
/** The two blocks of ✓ columns, either side of the summary. */
const SKILL_COLS = [6, 21];
const CERT_COLS = [22, 27];
const NOTE_COL = 30;

/**
 * The sheet writes "Dispenser"; the app's own list had "Dispensor". The sheet
 * is right — it is what the work-order types were renamed to — so the spelling
 * is corrected on the way in rather than a second value being created.
 */
const SPELLING = new Map([["Dispensor", "Dispenser"]]);

/**
 * Names the sheet spells differently from the record it means.
 *
 * Written out rather than matched fuzzily: two Thai names one character apart
 * are as likely to be two people as one, and this is a list of eleven — the
 * judgement belongs in a file where it can be read, not in a distance
 * function. The sheet wins on the spelling, because the sheet is the update.
 */
const ALSO_KNOWN_AS = new Map([["นัฐชัย กลีบสุวรรณ", "นัฐชัย กลับสุวรรณ"]]);

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
const fix = (s) => SPELLING.get(s) ?? s;
const same = (a, b) =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

const sheet = readSheet(FILE, "ช่างเทคนิค");
const header = sheet.rows[HEADER_ROW].map(clean);

/** One technician as the sheet has them. */
const wanted = [];
for (let r = FIRST_DATA_ROW; r < sheet.rows.length; r++) {
  const row = sheet.rows[r];
  const name = clean(row[1]);
  // The template ships with a worked example above the real rows.
  if (!name || clean(row[0]) === "ex") continue;

  const ticked = ([from, to]) => {
    const out = [];
    for (let c = from; c <= to; c++) if (clean(row[c]) && header[c]) out.push(fix(header[c]));
    return out;
  };

  wanted.push({
    name,
    nickname: clean(row[2]) || null,
    phone: clean(row[4]) || null,
    active: clean(row[5]) !== "ไม่ใช้งาน",
    skills: ticked(SKILL_COLS),
    certifications: ticked(CERT_COLS),
    note: clean(row[NOTE_COL]),
  });
}

const { data: existing, error } = await sb
  .from("technicians")
  .select("id, name, nickname, phone, active, skills, certifications");
if (error) throw new Error(error.message);

const byName = new Map(existing.map((t) => [clean(t.name), t]));
const byNick = new Map(existing.filter((t) => t.nickname).map((t) => [clean(t.nickname), t]));

const plan = [];
const missing = [];
for (const row of wanted) {
  const hit =
    byName.get(row.name) ??
    byName.get(ALSO_KNOWN_AS.get(row.name) ?? "\u0000") ??
    byNick.get(clean(row.nickname));
  if (!hit) {
    missing.push(row);
    continue;
  }

  // Losses get a line of their own: the sheet is authoritative, so a tick that
  // is not on it takes a skill away, and that has to be seen before it is
  // agreed to rather than found months later.
  const lost = (before, after) => (before ?? []).filter((v) => !after.includes(v));
  const changes = [];
  if (clean(hit.name) !== row.name) changes.push(`ชื่อ: ${hit.name} → ${row.name}`);
  if (clean(hit.nickname) !== clean(row.nickname))
    changes.push(`ชื่อเล่น: ${hit.nickname ?? "—"} → ${row.nickname ?? "—"}`);
  if (clean(hit.phone) !== clean(row.phone))
    changes.push(`เบอร์: ${hit.phone ?? "—"} → ${row.phone ?? "—"}`);
  if (hit.active !== row.active) changes.push(`สถานะ: ${hit.active} → ${row.active}`);
  if (!same(hit.skills ?? [], row.skills)) {
    changes.push(`ทักษะ: ${row.skills.join(", ") || "—"}`);
    const gone = lost(hit.skills, row.skills);
    if (gone.length) changes.push(`  ↳ เอาออก: ${gone.join(", ")}`);
  }
  if (!same(hit.certifications ?? [], row.certifications)) {
    changes.push(`ใบเซอร์: ${row.certifications.join(", ") || "—"}`);
    const gone = lost(hit.certifications, row.certifications);
    if (gone.length) changes.push(`  ↳ เอาออก: ${gone.join(", ")}`);
  }
  plan.push({ hit, row, changes });
}

const touched = new Set(plan.map((p) => p.hit.id));
const untouched = existing.filter((t) => !touched.has(t.id));

console.log(`\nในไฟล์ ${wanted.length} คน · ในระบบ ${existing.length} คน\n`);
for (const { row, changes } of plan) {
  if (!changes.length) {
    console.log(`= ${row.name} — ตรงกันอยู่แล้ว`);
    continue;
  }
  console.log(`~ ${row.name}`);
  for (const c of changes) console.log(`    ${c}`);
}
if (missing.length) {
  console.log("\nไม่พบในระบบ (ไม่สร้างใหม่ — ต้องมี user ก่อน):");
  for (const m of missing) console.log(`  ! ${m.name} (${m.nickname ?? "—"})`);
}
console.log("\nไม่อยู่ในไฟล์ — ไม่แตะต้อง:");
for (const t of untouched) console.log(`  · ${t.name}`);

if (APPLY) {
  let written = 0;
  for (const { hit, row, changes } of plan) {
    if (!changes.length) continue;
    // user_id is not in the payload: the account, and its username, stay put.
    const { error: e } = await sb
      .from("technicians")
      .update({
        name: row.name,
        nickname: row.nickname,
        phone: row.phone,
        active: row.active,
        skills: row.skills,
        certifications: row.certifications,
      })
      .eq("id", hit.id);
    if (e) {
      console.error(`  x ${row.name}: ${e.message}`);
      continue;
    }
    written++;
  }
  console.log(`\nบันทึกแล้ว ${written} คน`);
} else {
  console.log("\n(ทดลองรัน — ใส่ --apply เพื่อบันทึกจริง)");
}
