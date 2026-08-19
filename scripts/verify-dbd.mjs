/**
 * Checks the company names in an import sheet against the official juristic
 * person registry (DBD open API), and fills in what the registry knows.
 *
 *   node scripts/verify-dbd.mjs import-data/venio-1-companies.xlsx
 *   node scripts/verify-dbd.mjs import-data/venio-1-companies.xlsx --apply
 *
 * Without --apply it only reports. With it, the sheet is rewritten in place:
 * the registered name replaces `name`, the registry's line of business fills
 * `industry`, and the name that was there before is kept in `notes` so the
 * change stays traceable.
 *
 * Why bother: in the Uniwave export, every name that disagreed with the CRM
 * turned out to be the CRM's — informal spellings like "บ.ซีพีเอ็น ออยล์ จำกัด"
 * against the registered "บริษัท ซี พี เอ็น ออยล์ จำกัด" — and one row carried
 * a tax id belonging to an entirely different company. Names typed by hand
 * drift; the registration number does not.
 *
 * Lookups are cached next to the sheet, so a re-run costs no requests.
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { readSheet } from "./xlsx-read.mjs";
import { COMPANIES } from "./import-schema.mjs";
import { buildTemplateWorkbook } from "./import-workbook.mjs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const CACHED_ONLY = args.includes("--cached-only");
const file = args.find((a) => !a.startsWith("--"));

if (!file) {
  console.error("ใช้: node scripts/verify-dbd.mjs <ไฟล์ลูกค้า.xlsx> [--apply]");
  process.exit(1);
}

const CACHE = join(dirname(file), "dbd-cache.json");
const API = "https://openapi.dbd.go.th/api/v1/juristic_person/";
/**
 * The registry is a public service behind a bot filter that starts returning
 * 403 after roughly fifty quick requests, and the block outlasts the run. Pace
 * requests well apart, and pass --delay=<ms> to go slower still. Results are
 * cached, so a blocked run loses nothing — just rerun it later.
 */
const DELAY_MS = Number(args.find((a) => a.startsWith("--delay="))?.slice(8)) || 3000;

const s = (v) => String(v ?? "").trim();
const digits = (v) => s(v).replace(/\D/g, "");
const norm = (v) => s(v).replace(/\s+/g, " ").trim().toLowerCase();

/** Ignores spacing entirely — most disagreements here are just spaces. */
const tight = (v) => s(v).replace(/\s+/g, "").toLowerCase();

const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
const saveCache = () => writeFileSync(CACHE, JSON.stringify(cache, null, 2), "utf8");

/**
 * Every lookup costs a request against a rate-limited public service, so the
 * cache is flushed as we go. A run that gets blocked, killed, or cut off part
 * way then keeps everything it fetched — losing a long run's worth of results
 * would mean asking the registry for them all over again.
 */
const SAVE_EVERY = 10;
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { saveCache(); process.exit(1); });

/**
 * Facts the registry cannot tell us from the number we hold. When a company
 * converts — a partnership becoming a company, a company going public — the
 * old registration keeps the old name and is merely marked "แปรสภาพ"; the
 * successor sits under a different number we do not have. These names were
 * confirmed by the business, so they are recorded here rather than left as a
 * stale name the registry appears to endorse.
 */
const OVERRIDES = {
  "0105565193515": {
    nameTH: "บริษัท ไทยน้ำทิพย์ คอร์ปอเรชั่น จำกัด (มหาชน)",
    why: "แปรสภาพจาก บริษัท ไทยน้ำทิพย์ คอร์ปอเรชั่น จำกัด",
  },
  "0843558001489": {
    nameTH: "บริษัท พรแม่ย่าธุรกิจ 2015 จำกัด",
    why: "แปรสภาพจาก ห้างหุ้นส่วนจำกัด พรแม่ย่าธุรกิจ 2015",
  },
};

function extract(payload) {
  const p = payload?.["cd:OrganizationJuristicPerson"];
  if (!p) return null;
  return {
    nameTH: s(p["cd:OrganizationJuristicNameTH"]),
    nameEN: s(p["cd:OrganizationJuristicNameEN"]),
    type: s(p["cd:OrganizationJuristicType"]),
    status: s(p["cd:OrganizationJuristicStatus"]),
    industry: s(
      p["cd:OrganizationJuristicObjective"]?.["td:JuristicObjective"]?.["td:JuristicObjectiveTextTH"]
    ),
  };
}

/** Layers a confirmed successor name over what the registry returned. */
function applyOverride(taxId, rec) {
  const o = OVERRIDES[taxId];
  if (!o || !rec || rec.notFound) return rec;
  return { ...rec, nameTH: o.nameTH, status: "ยังดำเนินกิจการอยู่", converted: o.why };
}

/** Thrown when the bot filter is still refusing after we have waited it out. */
class Blocked extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The filter lets go after a few minutes rather than for the rest of the day,
 * so a 403 is something to wait out, not to abandon the run over — the previous
 * design gave up on the first one and a run starting inside the tail of an
 * earlier block achieved nothing at all. Back off, doubling, and only stop once
 * it is clear the block is not lifting.
 */
const BACKOFF_MS = [60_000, 120_000, 240_000, 480_000];

async function lookup(taxId) {
  if (cache[taxId]) return applyOverride(taxId, cache[taxId]);
  // --cached-only: re-apply what is already known without touching the network,
  // which is what you want when the registry is refusing and the point of the
  // run is to write corrections, not to fetch more of them.
  if (CACHED_ONLY) return { pending: true };

  let blocks = 0; // times the filter refused, driving the backoff
  let errors = 0; // transport failures, worth one quick retry

  for (;;) {
    try {
      const res = await fetch(API + taxId, {
        headers: { "User-Agent": "unicloud-crm-import/1.0", Accept: "application/json" },
      });
      const body = await res.text();
      // The filter answers 403 with an HTML challenge page rather than JSON.
      if (res.status === 403 || body.trimStart().startsWith("<")) {
        if (blocks >= BACKOFF_MS.length) throw new Blocked();
        const wait = BACKOFF_MS[blocks++];
        console.log(`   … ทะเบียนตอบ 403 — รอ ${wait / 1000} วินาทีแล้วลองใหม่ (ครั้งที่ ${blocks})`);
        saveCache();
        await sleep(wait);
        continue;
      }
      const json = JSON.parse(body);
      const rec = json?.data?.[0] ? extract(json.data[0]) : null;
      cache[taxId] = rec ?? { notFound: true, reason: s(json?.status?.description) || "ไม่พบข้อมูล" };
      return cache[taxId];
    } catch (e) {
      if (e instanceof Blocked) throw e;
      if (++errors > 1) return { error: e.message };
      await sleep(1000);
    }
  }
}

// ---------------------------------------------------------------------------

const sheet = readSheet(file);
const header = (sheet.rows[0] ?? []).map(s);
const rows = sheet.rows
  .slice(1)
  .map((r) => Object.fromEntries(header.map((k, i) => [k, s(r[i])])))
  .filter((o) => Object.values(o).some(Boolean));

/**
 * Both juristic persons and people carry a 13-digit id, and the export mixes
 * them — Venio's "individual" customers are filed under a national id. Only a
 * juristic registration number starts with 0, and only those exist in this
 * registry, so looking the rest up would just burn requests on certain misses.
 */
const isJuristic = (v) => digits(v).length === 13 && digits(v).startsWith("0");

const withTax = rows.filter((r) => isJuristic(r.tax_id));
const personal = rows.filter((r) => digits(r.tax_id).length === 13 && !isJuristic(r.tax_id));
const oddTax = rows.filter((r) => r.tax_id && digits(r.tax_id).length !== 13);

console.log(`ไฟล์      : ${file}`);
console.log(`แถวทั้งหมด : ${rows.length}`);
console.log(`เลขนิติบุคคล : ${withTax.length}  ·  เลขบุคคลธรรมดา ${personal.length}  ·  ไม่มีเลข ${rows.length - withTax.length - personal.length - oddTax.length}  ·  เลขผิดรูป ${oddTax.length}`);
console.log(`แคชเดิม   : ${Object.keys(cache).length} เลข`);
console.log(APPLY ? "โหมด      : เขียนทับไฟล์" : "โหมด      : ทดลอง (ไม่แก้ไฟล์) — ใส่ --apply เพื่อเขียน");
console.log();

/**
 * Excel keeps the workbook locked while it is open, and the rewrite is the very
 * last thing this script does — discovering that after several minutes of
 * lookups wastes both the time and the requests. Check now instead.
 */
if (APPLY) {
  try {
    appendFileSync(file, "");
  } catch (e) {
    console.error(`\n✗ เขียนทับ ${file} ไม่ได้ (${e.code}) — ไฟล์น่าจะเปิดค้างอยู่ใน Excel`);
    console.error("  ปิดไฟล์ใน Excel ก่อน แล้วรันใหม่ (ผลที่ตรวจไว้อยู่ในแคชแล้ว ไม่ต้องยิงซ้ำ)");
    process.exit(1);
  }
}

const report = { same: [], differs: [], notFound: [], inactive: [], errors: [] };
let done = 0;

let blocked = false;
for (const row of withTax) {
  const tax = digits(row.tax_id);
  // Only a real request needs pacing; replaying the cache should be instant.
  const wasCached = Boolean(cache[tax]);
  let hit;
  try {
    hit = await lookup(tax);
  } catch (e) {
    if (!(e instanceof Blocked)) throw e;
    blocked = true;
    break;
  }
  done++;
  if (done % SAVE_EVERY === 0) saveCache();
  if (done % 25 === 0) process.stdout.write(`   ...ตรวจแล้ว ${done}/${withTax.length}\n`);

  if (hit?.pending) continue;   // --cached-only: not fetched, nothing to say
  if (hit?.error) {
    report.errors.push({ tax, name: row.name, why: hit.error });
    continue;
  }
  if (hit?.notFound) {
    report.notFound.push({ tax, name: row.name, why: hit.reason });
    continue;
  }
  if (hit.status && !hit.status.includes("ยังดำเนินกิจการอยู่")) {
    report.inactive.push({ tax, name: row.name, status: hit.status });
  }

  row.__dbd = hit;
  if (tight(hit.nameTH) === tight(row.name)) report.same.push({ tax, name: row.name });
  else report.differs.push({ tax, was: row.name, now: hit.nameTH });

  if (!cache[tax].cachedAt) cache[tax].cachedAt = true;
  if (!wasCached) await new Promise((r) => setTimeout(r, DELAY_MS));
}

saveCache();

if (blocked) {
  const left = withTax.filter((r) => !cache[digits(r.tax_id)]).length;
  console.log(`\n⛔ ทะเบียนตอบ 403 (ตัวกรองบอทของ DBD) — หยุดกลางทาง`);
  console.log(`   ตรวจครบแล้ว ${withTax.length - left} เลข · เหลืออีก ${left} เลข`);
  console.log(`   ผลที่ได้เก็บไว้ใน ${CACHE} แล้ว — รันซ้ำจะไม่ยิงเลขเดิม`);
  console.log(`   การบล็อกอิงตาม IP และคลายเองเมื่อเวลาผ่านไป ลองใหม่ภายหลังด้วย --delay=6000`);
  console.log(`   ถ้าต้องตรวจครบทุกเลขเป็นประจำ ขอ API key กับ DBD จะเป็นทางที่ถูกต้องกว่า`);
}

// ---------------------------------------------------------------------------

const show = (list, label, fmt, limit = 40) => {
  if (!list.length) return;
  console.log(`\n${label} (${list.length})`);
  list.slice(0, limit).forEach((x) => console.log("   " + fmt(x)));
  if (list.length > limit) console.log(`   … อีก ${list.length - limit} รายการ`);
};

console.log(`\nสรุป: ชื่อตรงทะเบียน ${report.same.length} · ชื่อไม่ตรง ${report.differs.length} · ` +
  `ไม่พบในทะเบียน ${report.notFound.length} · ไม่ได้ดำเนินกิจการแล้ว ${report.inactive.length}`);

show(report.differs, "ชื่อไม่ตรงทะเบียน — จะแก้เป็นชื่อทางการ", (x) => `${x.was}\n       → ${x.now}`);
show(report.notFound, "ไม่พบเลขนี้ในทะเบียน — ต้องตรวจเลขด้วยมือ", (x) => `${x.tax}  ${x.name}  (${x.why})`);
show(report.inactive, "⚠ ไม่ได้ดำเนินกิจการแล้ว", (x) => `${x.name}  — ${x.status}`);
show(oddTax, "เลขผู้เสียภาษีผิดรูปแบบ", (x) => `${x.name}  → “${x.tax_id}” (${digits(x.tax_id).length} หลัก)`);
show(report.errors, "เรียก API ไม่สำเร็จ", (x) => `${x.tax}  ${x.name}  — ${x.why}`);
show(personal, "เลขบุคคลธรรมดา — ไม่ได้อยู่ในทะเบียนนิติบุคคล จึงข้ามไป", (x) => `${x.name}  (${digits(x.tax_id)})`, 10);

if (!APPLY) {
  console.log("\nยังไม่ได้แก้ไฟล์ — ตรวจรายการข้างบนแล้วรันซ้ำด้วย --apply");
  process.exit(0);
}

// ---- rewrite ---------------------------------------------------------------
let renamed = 0;
let industried = 0;
for (const row of rows) {
  const d = row.__dbd;
  delete row.__dbd;
  if (!d) continue;

  if (d.nameTH && tight(d.nameTH) !== tight(row.name)) {
    // Keep what the export called it — that is the name staff recognise.
    row.notes = [row.notes, `ชื่อเดิมในไฟล์นำเข้า: ${row.name}`].filter(Boolean).join("\n");
    row.name = d.nameTH;
    renamed++;
  }
  if (d.industry && !row.industry) {
    row.industry = d.industry;
    industried++;
  }
  const extra = [
    d.nameEN ? `ชื่อภาษาอังกฤษ (ทะเบียน): ${d.nameEN}` : "",
    d.status && !d.status.includes("ยังดำเนินกิจการอยู่") ? `สถานะนิติบุคคล: ${d.status}` : "",
    d.converted ? `หมายเหตุนิติบุคคล: ${d.converted}` : "",
  ].filter(Boolean);
  if (extra.length) row.notes = [row.notes, ...extra].filter(Boolean).join("\n");
}

const notes = [
  "ชื่อลูกค้าตรวจกับทะเบียนนิติบุคคล (DBD open API) แล้ว — ชื่อที่ไม่ตรงถูกแก้เป็นชื่อทางการ",
  "ชื่อเดิมจากไฟล์นำเข้าเก็บไว้ในช่อง notes",
];
writeFileSync(file, buildTemplateWorkbook(COMPANIES, rows, notes));
console.log(`\n✓ เขียนทับ ${file} แล้ว — แก้ชื่อ ${renamed} แถว · เติมประเภทธุรกิจ ${industried} แถว`);
