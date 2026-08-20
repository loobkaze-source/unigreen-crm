/**
 * Where each FusionSolar plant sits in the CRM.
 *
 * The portal names a plant the way the installer typed it, and the CRM names a
 * station the way the customer files it, so which plant is which site is a
 * reading somebody had to make. It is made once, here, because two things now
 * depend on it — the service contracts (plan-solar-service.mjs) and the
 * machines standing on those roofs (plan-solar-devices.mjs) — and a second
 * copy of that reading is a second thing to keep in step.
 */
import { readSheet } from "./xlsx-read.mjs";

export const SOURCE = "import-data/solar_grid_connection_dates.xlsx";
export const SHEET = "Grid Connection";

/**
 * Plant No. → [the customer's existing site it sits on, why we read it that
 * way]. Anything missing here is created as a new site.
 */
export const LINKS = {
  1: ["(บางขุนนนท์)", "ไซต์เดียวของลูกค้า และมีอุปกรณ์ Solar Cell อยู่แล้ว"],
  7: ["Buahan Village Hotel", "โรงแรมเดียวกัน"],
  8: ["PTT Station ปตท.แยกอนุกูลนารี (น้ำมัน+EV)", "สถานีเดียวกับชื่อแผง"],
  9: ["PTT Station ปตท.แยกอนุกูลนารี (น้ำมัน+EV)", "สถานีเดียวกับชื่อแผง"],
  15: ["PTT Station", "บรบือ — ลูกค้ามีสองระเบียนพิกัดเดียวกัน เลือกที่อยู่ส่งของ"],
  16: ["PTT Station", "บรบือ — ลูกค้ามีสองระเบียนพิกัดเดียวกัน เลือกที่อยู่ส่งของ"],
  17: ["Gas station PTT Amnat Charoen.", "ไซต์เดียวของลูกค้า"],
  18: ["Gas station PTT Amnat Charoen.", "ไซต์เดียวของลูกค้า"],
  19: ["PTT Station ปตท.ไก่คำ (น้ำมัน+EV) (ptt kai kham gas station)", "ไก่คำ — สองระเบียนพิกัดเดียวกัน เลือกที่อยู่ส่งของ"],
  20: ["PTT Station ปตท.ไก่คำ (น้ำมัน+EV) (ptt kai kham gas station)", "ไก่คำ — สองระเบียนพิกัดเดียวกัน เลือกที่อยู่ส่งของ"],
  21: ["ปั๊ม ปตท.บจก.รัตนชาติ 999", "ที่อยู่เป็นถนนทุ่งโพธิ์ ตรงกับชื่อแผง"],
  22: ["PTT Station (Petrol+EV)", "ที่อยู่เป็น ต.นางั่ว ตรงกับชื่อแผง"],
  23: ["PTT Station (Petrol+EV)", "ที่อยู่เป็น ต.นางั่ว ตรงกับชื่อแผง"],
  24: ["PTT Station", "ศรีเทพ — ไซต์เดียวของลูกค้า"],
  25: ["PTT Station", "ศรีเทพ — ไซต์เดียวของลูกค้า"],
  26: ["PTT Station (Petrol+EV)", "มหาราช จันทบุรี — ไซต์เดียวของลูกค้า"],
  27: ["PTT Station ปตท.เมืองเกษตรวิสัย (น้ำมัน+EV)", "สองระเบียนพิกัดเดียวกัน เลือกที่อยู่ส่งของ"],
  28: ["PTT Station ปตท.เมืองเกษตรวิสัย (น้ำมัน+EV)", "สองระเบียนพิกัดเดียวกัน เลือกที่อยู่ส่งของ"],
  29: ["PTT Station", "สาขา1 — ระเบียนที่เป็นตัวสถานี"],
  30: ["7-11 ปตท.เกษตรวิสัย", "สาขา1 — ระเบียนที่เป็นตัว 7-11"],
  31: ["PTT Station (Petrol+EV) 304 Industrial", "นิคมฯ 304 — สองระเบียนพิกัดเดียวกัน เลือกที่อยู่ส่งของ"],
  32: ["PTT Station (Petrol+EV) 304 Industrial", "นิคมฯ 304 — สองระเบียนพิกัดเดียวกัน เลือกที่อยู่ส่งของ"],
  35: ["PTT Station ปตท. สาขา พระยาตรัง - ท่าใหม่", "สถานีเดียวกับชื่อแผง"],
  36: ["PTT Station ปตท. สาขา พระยาตรัง - ท่าใหม่", "สถานีเดียวกับชื่อแผง"],
  38: ["7-Eleven สาขา PTTOR น้ำชุน (หล่มสัก) (10169)", "ปตท. หล่มสัก — ไซต์เดียวของลูกค้า"],
  39: ["7-Eleven สาขา PTTOR น้ำชุน (หล่มสัก) (10169)", "ปตท. หล่มสัก — ไซต์เดียวของลูกค้า"],
  40: ["PTT Station", "หล่มสัก — เหลือสองระเบียนพิกัดเดียวกัน เลือกที่อยู่ส่งของ"],
  41: ["PTT Station", "หล่มสัก — เหลือสองระเบียนพิกัดเดียวกัน เลือกที่อยู่ส่งของ"],
  42: ["PTT", "แยกเกษมพล สัตหีบ ชลบุรี — ไซต์เดียวของลูกค้า"],
  43: ["PTT", "แยกเกษมพล สัตหีบ ชลบุรี — ไซต์เดียวของลูกค้า"],
  45: ["PTT Station", "แม่ปั๋ง พร้าว — ไซต์เดียวของลูกค้า"],
  46: ["PTT Station", "แม่ปั๋ง พร้าว — ไซต์เดียวของลูกค้า"],
  47: ["อเมซอนสตาร์ (ห้าแยก)", "ชื่อไซต์ตรงกับชื่อแผง"],
  52: ["21082025_บางจาก เชียงของ", "ชื่อไซต์ตรงกับชื่อแผง และมีอุปกรณ์อยู่แล้ว 11 ชิ้น"],
  53: ["PTT Station ปตท.สะพานพระราม 5 (ขาเข้า) (น้ำมัน+EV)", "สถานีเดียวกับชื่อแผง"],
  55: ["ปตท. หจก.โพธิ์สว่างออยล์", "ชื่อไซต์ตรงกับชื่อแผง"],
  56: ["PTT Station (Petrol+NGV+EV)", "ไซต์เดียวของลูกค้าในนครสวรรค์ — ที่อยู่ในระบบเป็น ต.ยางตาล ไม่ใช่เขาทอง"],
};

// ---------------------------------------------------------------------------

export const s = (v) => String(v ?? "").trim();
export const norm = (v) =>
  s(v).replace(/ํา/g, "ำ").replace(/จํากัด/g, "จำกัด").replace(/\s+/g, " ").toLowerCase();

export async function loadAll(sb, orgId, table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from(table).select(columns).eq("org_id", orgId).range(from, from + 999);
    if (error) throw new Error(`อ่าน ${table} ไม่ได้: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/**
 * Every plant in the grid-connection sheet, on the site it belongs to: an
 * existing one when LINKS says which, else a site of its own named after the
 * plant. Throws rather than guessing — a customer that cannot be found or a
 * LINKS target that no longer resolves is a mismatch to fix, not to skip.
 */
export async function placePlants({ sb, orgId }) {
  const companies = await loadAll(sb, orgId, "companies", "id, name");
  const sites = await loadAll(sb, orgId, "sites", "id, name, company_id");
  const byCompany = new Map(companies.map((c) => [norm(c.name), c]));

  const sheet = readSheet(SOURCE, SHEET);
  const head = (sheet.rows[0] ?? []).map(s);
  if (head[3] !== "Customer (Unicloud)")
    throw new Error("ไฟล์ต้นทางยังไม่มีคอลัมน์ Customer (Unicloud) — รัน match-solar-plants.mjs ก่อน");

  const plants = sheet.rows.slice(1)
    .filter((r) => /^\d+$/.test(s(r[0])))
    .map((r) => ({ no: Number(r[0]), plant: s(r[1]), date: s(r[2]), customer: s(r[3]) }));

  return plants.map((p) => {
    const co = byCompany.get(norm(p.customer));
    if (!co) throw new Error(`[${p.no}] ไม่พบลูกค้า “${p.customer}” ในระบบ`);

    const link = LINKS[p.no];
    if (!link) return { ...p, co, siteName: p.plant, isNew: true, why: "ยังไม่มีไซต์นี้ในระบบ" };

    const [siteName, why] = link;
    const hits = sites.filter((x) => x.company_id === co.id && norm(x.name) === norm(siteName));
    if (hits.length !== 1)
      throw new Error(
        `[${p.no}] LINKS ชี้ไปที่ไซต์ “${siteName}” ของ ${co.name} แต่พบ ${hits.length} แห่ง — ` +
        "ไซต์อาจถูกเปลี่ยนชื่อหรือรวมไปแล้ว ตรวจตารางก่อน"
      );
    return { ...p, co, siteName: hits[0].name, siteId: hits[0].id, isNew: false, why };
  });
}
