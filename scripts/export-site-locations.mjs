/**
 * Exports every site's location to a spreadsheet, for use outside the CRM.
 *
 *   node scripts/export-site-locations.mjs
 *   node scripts/export-site-locations.mjs --resolve   (follow short links too)
 *
 * The CRM stores a site's location two ways and neither is a coordinate pair:
 * a free-text address, and a Google Maps link. Most of the links carry the
 * coordinates in them — "?q=13.62,100.63", or "@13.62,100.63" once a shortened
 * one has been followed — so that is where latitude and longitude come from.
 *
 * Read-only. It writes one file and touches nothing in the database.
 *
 * --resolve issues one HTTP request per shortened link (maps.app.goo.gl,
 * share.google) to see where it points. Off by default because it is a few
 * dozen calls out to Google and the rest of the export does not need them.
 */
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildXlsx, sheetXml, colName, S } from "./xlsx-write.mjs";

const RESOLVE = process.argv.includes("--resolve");
const OUT = "import-data/site-locations.xlsx";

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

/** PostgREST caps a response at 1,000 rows and says nothing about it. */
async function all(query) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

/**
 * Latitude and longitude out of a Google Maps URL.
 *
 * Two shapes carry them: the "?q=" a share produces, and the "@" in the path
 * of a full map view. A pair of whole numbers — "?q=13,100" — is somebody's
 * placeholder rather than a place: that is 100km of Thailand, and it is
 * reported as suspect rather than exported as a location.
 */
function coordsFrom(url) {
  if (!url) return null;
  const m =
    /[?&]q=(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/.exec(url) ??
    /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/.exec(url);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const rough = Number.isInteger(lat) && Number.isInteger(lng);
  return { lat, lng, rough };
}

/**
 * Degrees-minutes-seconds out of free text: 13°42'37.0"N 100°49'20.3"E.
 *
 * One site is named that and another has it in its address — somebody pasted
 * what Google showed them — while its map link is the truncated "?q=13,100".
 * The text is the real location and the link is not, so the text wins.
 */
function dmsFrom(text) {
  const m = /(\d{1,3})°(\d{1,2})'([\d.]+)"?\s*([NS])[,\s]+(\d{1,3})°(\d{1,2})'([\d.]+)"?\s*([EW])/.exec(
    text ?? ""
  );
  if (!m) return null;
  const dec = (d, mi, se, hemi) =>
    (Number(d) + Number(mi) / 60 + Number(se) / 3600) * (hemi === "S" || hemi === "W" ? -1 : 1);
  return {
    lat: Number(dec(m[1], m[2], m[3], m[4]).toFixed(7)),
    lng: Number(dec(m[5], m[6], m[7], m[8]).toFixed(7)),
  };
}

const isShortLink = (url) => /maps\.app\.goo\.gl|goo\.gl\/maps|share\.google/.test(url ?? "");

/** Where a shortened link actually points. Null if it will not say. */
async function resolveShort(url) {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20000) });
    return res.url || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
//  Gather
// ---------------------------------------------------------------------------
const [sites, companies] = await Promise.all([
  all(() => sb.from("sites").select("id, name, address, map_url, company_id, notes")),
  all(() => sb.from("companies").select("id, name")),
]);
const companyName = new Map(companies.map((c) => [c.id, c.name]));

const rows = sites.map((s) => ({
  id: s.id,
  name: (s.name ?? "").trim(),
  company: companyName.get(s.company_id) ?? "",
  address: (s.address ?? "").trim(),
  mapUrl: (s.map_url ?? "").trim(),
  notes: (s.notes ?? "").trim(),
  lat: null,
  lng: null,
  source: "",
  note: "",
}));

for (const r of rows) {
  const c = coordsFrom(r.mapUrl);
  // A whole-number pair is 100km of Thailand, not a place. Before writing it
  // off, look for a real one written into the name or the address.
  const dms = c?.rough || !c ? dmsFrom(`${r.name} ${r.address}`) : null;
  if (dms) {
    r.lat = dms.lat;
    r.lng = dms.lng;
    r.source = "ชื่อ/ที่อยู่ (พิกัด DMS)";
    if (c?.rough) r.note = "ลิงก์แผนที่มีแต่ค่าตัวอย่าง — ใช้พิกัดจากชื่อ/ที่อยู่แทน";
  } else if (c) {
    r.lat = c.lat;
    r.lng = c.lng;
    r.source = "map_url";
    if (c.rough) {
      r.lat = null;
      r.lng = null;
      r.source = "";
      r.note = "ลิงก์แผนที่มีแต่ค่าตัวอย่าง (จำนวนเต็ม) — ไม่ใช่ตำแหน่งจริง";
    }
  } else if (r.mapUrl) {
    r.note = isShortLink(r.mapUrl) ? "ลิงก์ย่อ — ต้องเปิดเพื่อดูพิกัด" : "ลิงก์ไม่มีพิกัดอยู่ในตัว";
  }
}

if (RESOLVE) {
  const shorts = rows.filter((r) => !r.lat && isShortLink(r.mapUrl));
  console.log(`กำลังเปิดลิงก์ย่อ ${shorts.length} รายการ…`);
  for (const r of shorts) {
    const full = await resolveShort(r.mapUrl);
    const c = full ? coordsFrom(full) : null;
    if (c) {
      r.lat = c.lat;
      r.lng = c.lng;
      r.source = "ลิงก์ย่อ (เปิดแล้ว)";
      r.note = "";
    } else {
      r.note = "เปิดลิงก์ย่อแล้วไม่พบพิกัด";
    }
  }
}

// Sites with a location first; then the rest, alphabetically, so the useful
// part of the file is at the top and the gaps are visible under it.
rows.sort((a, b) => {
  if (!!a.lat !== !!b.lat) return a.lat ? -1 : 1;
  return a.name.localeCompare(b.name, "th");
});

// ---------------------------------------------------------------------------
//  Write
// ---------------------------------------------------------------------------
const COLS = [
  { key: "name", head: "ไซต์งาน", width: 46 },
  { key: "company", head: "ลูกค้า", width: 38 },
  { key: "lat", head: "latitude", width: 14, num: true },
  { key: "lng", head: "longitude", width: 14, num: true },
  { key: "address", head: "ที่อยู่", width: 52 },
  { key: "mapUrl", head: "Google Maps URL", width: 46, text: true },
  { key: "source", head: "ที่มาของพิกัด", width: 20 },
  { key: "note", head: "หมายเหตุ", width: 40 },
  { key: "id", head: "site_id", width: 38, text: true },
];

const head = { cells: COLS.map((c) => ({ v: c.head, s: S.HEAD_OPT })) };
const body = rows.map((r) => ({
  cells: COLS.map((c) => {
    const v = r[c.key];
    if (c.num) return { v: v ?? "", s: S.BODY };
    return { v: v ?? "", s: c.text ? S.TEXT : S.BODY };
  }),
}));

const withCoords = rows.filter((r) => r.lat !== null);
const guide = sheetXml({
  cols: [{ width: 110 }],
  rows: [
    { cells: [{ v: "พิกัดไซต์งาน — ส่งออกจาก Unicloud CRM", s: S.TITLE }] },
    { cells: [] },
    ...[
      `ไซต์ทั้งหมด ${rows.length} แห่ง · มีพิกัด ${withCoords.length} แห่ง · มีที่อยู่ ${rows.filter((r) => r.address).length} แห่ง`,
      `ส่งออกเมื่อ ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`,
      "",
      "latitude / longitude ดึงมาจาก Google Maps URL ที่บันทึกไว้ในแต่ละไซต์",
      "ไซต์ที่ไม่มีลิงก์แผนที่จะไม่มีพิกัด — ใช้คอลัมน์ “ที่อยู่” ไป geocode เอาเองได้",
      "คอลัมน์ site_id คือคีย์ของไซต์ในระบบ ใช้จับคู่ข้อมูลกลับได้ถ้าต้องอัปเดตภายหลัง",
      "",
      "รันซ้ำเพื่ออัปเดตไฟล์:  node scripts/export-site-locations.mjs",
      "เพิ่ม --resolve เพื่อเปิดลิงก์ย่อ (maps.app.goo.gl / share.google) หาพิกัดด้วย",
    ].map((t) => ({ cells: [{ v: t, s: S.NOTE }] })),
  ],
});

writeFileSync(
  OUT,
  buildXlsx([
    {
      name: "พิกัดไซต์งาน",
      xml: sheetXml({
        cols: COLS.map((c) => ({ width: c.width, style: c.text ? S.TEXT : undefined })),
        rows: [head, ...body],
        freezeRows: 1,
        autoFilter: `A1:${colName(COLS.length)}1`,
      }),
    },
    { name: "อ่านก่อน", xml: guide },
  ])
);

const shortsLeft = rows.filter((r) => !r.lat && isShortLink(r.mapUrl)).length;
console.log(`\n✓ ${OUT}`);
console.log(`ไซต์ทั้งหมด ${rows.length} · มีพิกัด ${withCoords.length} · มีที่อยู่ ${rows.filter((r) => r.address).length}`);
const placeholders = rows.filter((r) => r.note.includes("ค่าตัวอย่าง")).length;
if (placeholders) console.log(`ลิงก์ที่เป็นค่าตัวอย่าง ${placeholders} รายการ — ดูคอลัมน์หมายเหตุ`);
if (shortsLeft) console.log(`ลิงก์ย่อที่ยังไม่ได้เปิด ${shortsLeft} รายการ — รันใหม่ด้วย --resolve`);
