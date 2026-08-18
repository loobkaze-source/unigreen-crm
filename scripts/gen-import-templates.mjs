/**
 * Generates the bulk-import Excel templates in /import-templates.
 *
 *   node scripts/gen-import-templates.mjs
 *
 * Writes .xlsx by hand (ZIP + OOXML) so the repo needs no extra dependency.
 * The column specs below are the single source of truth: they drive the data
 * sheet, the dropdowns, the example rows and the generated guide sheet, so
 * editing a spec keeps all three in sync.
 */
import { deflateRawSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "import-templates");

// ---------------------------------------------------------------------------
//  Column specs — one entry per spreadsheet column
//    key      column header (the name an importer reads)
//    req      true → header painted in the "required" colour
//    rec      true → header painted amber: optional, but other templates
//                    match on it, so leaving it blank breaks the chain
//    type     shown in the guide sheet
//    list     dropdown values (also documented in the guide)
//    width    column width in Excel units
//    desc     Thai explanation for the guide sheet
// ---------------------------------------------------------------------------

const LEGEND =
  "หัวคอลัมน์สีส้ม = จำเป็นต้องกรอก / สีเหลือง = ไม่บังคับ แต่แนะนำอย่างยิ่ง / สีเขียว = เว้นว่างได้";

const COMPANIES = {
  file: "import-template-companies.xlsx",
  title: "เทมเพลตนำเข้าลูกค้า (companies)",
  table: "public.companies",
  intro: [
    "กรอกข้อมูลในชีต “ข้อมูล” เท่านั้น — แถวที่ 1 เป็นหัวคอลัมน์ ห้ามแก้ ห้ามสลับลำดับ ห้ามลบ",
    LEGEND,
    "ดูตัวอย่างการกรอกได้ที่ชีต “ตัวอย่าง” — ห้ามกรอกข้อมูลจริงลงในชีตนั้น",
    "นำเข้าไฟล์นี้เป็นอันดับแรก — ผู้ติดต่อ ไซต์งาน และสัญญาบริการ ล้วนอ้างถึงลูกค้าในไฟล์นี้",
    "customer_code และ tax_id ต้องไม่ซ้ำกันในไฟล์ ระบบไม่ได้บังคับความไม่ซ้ำให้ ถ้าซ้ำการจับคู่ของไฟล์อื่นจะได้บริษัทผิดตัว",
    "ในระบบตอนนี้มีลูกค้าอยู่แล้ว 31 ราย — ถ้าแถวไหนเป็นลูกค้าเดิม ให้กรอก tax_id หรือชื่อให้ตรงของเดิม จะได้ไม่เกิดข้อมูลซ้ำ",
  ],
  cols: [
    { key: "name", req: true, type: "ข้อความ", width: 34,
      desc: "ชื่อลูกค้า/นิติบุคคล เช่น “บริษัท ไทยรุ่งเรือง จำกัด” — ถ้าเว้นว่างแถวนั้นจะถูกข้าม" },
    { key: "tax_id", rec: true, type: "ข้อความ", width: 18, fmt: "text",
      desc: "เลขประจำตัวผู้เสียภาษี 13 หลัก — กุญแจหลักที่ไฟล์อื่นใช้อ้างถึงลูกค้ารายนี้ (ในระบบตอนนี้ลูกค้าเดิมกรอก tax_id ไว้ 26 จาก 31 ราย จึงเชื่อถือได้กว่า customer_code) · ตั้งรูปแบบช่องเป็น Text ไว้แล้ว เลข 0 นำหน้าจะไม่หาย" },
    { key: "customer_code", type: "ข้อความ", width: 16,
      desc: "รหัสลูกค้า — ถ้ามีให้กรอก ระบบจะใช้จับคู่ก่อน tax_id · รูปแบบให้ยึดตามที่ใช้อยู่เดิม เช่น GS20260001, CD00736, L20260001 (ระบบไม่ได้บังคับรูปแบบ) · ปัจจุบันลูกค้าเดิมมีรหัสแค่ 4 จาก 31 ราย" },
    { key: "tags", type: "ข้อความ คั่นด้วย ,", width: 26,
      desc: "แท็กสำหรับกรองในหน้ารายชื่อ ใส่ได้หลายอันคั่นด้วยจุลภาค เช่น “PT, โรงงาน” · แท็กที่ใช้อยู่จริงในระบบ: PT / PTT / Shell / Caltex / BCP / โรงงาน / ตึกแถว / บริษัท / จำหน่าย-ติดตั้ง-ซ่อม (พิมพ์แท็กใหม่เองได้)" },
    { key: "industry", type: "ข้อความ", width: 20, desc: "ประเภทธุรกิจ เช่น โรงงานอุตสาหกรรม, ค้าปลีก" },
    { key: "phone", type: "ข้อความ", width: 16, fmt: "text", desc: "เบอร์โทรหลักของบริษัท" },
    { key: "website", type: "URL", width: 26, desc: "เว็บไซต์บริษัท" },
    { key: "address", type: "ข้อความ", width: 42,
      desc: "ที่อยู่จดทะเบียน/ที่อยู่ออกใบกำกับภาษี (คนละอันกับที่อยู่ไซต์งาน ซึ่งอยู่ในเทมเพลตไซต์งาน)" },
    { key: "notes", type: "ข้อความ", width: 30, desc: "หมายเหตุ เช่น เงื่อนไขเครดิต ผู้ดูแลหลัก" },
  ],
  examples: [
    ["บริษัท ไทยรุ่งเรือง ปิโตรเลียม จำกัด", "0105536000123", "GS20260012", "PT, โรงงาน", "สถานีบริการน้ำมัน",
      "02-123-4567", "https://example.co.th", "99/1 ถ.พระราม 3 แขวงบางโพงพาง เขตยานนาวา กรุงเทพฯ 10120", "เครดิต 30 วัน"],
    ["ห้างหุ้นส่วนจำกัด เอ็นเนอร์ยี่ พลัส", "0105551000456", "", "Shell, ตึกแถว", "จำหน่าย-ติดตั้ง-ซ่อม",
      "02-987-6543", "", "45 ซ.ลาดพร้าว 101 แขวงคลองจั่น เขตบางกะปิ กรุงเทพฯ 10240", "ไม่มีรหัสลูกค้าเดิม เว้นว่างได้"],
    ["บริษัท สุขสบาย เซอร์วิส จำกัด", "0215559000789", "CD00812", "Caltex, บริษัท", "บริการหลังการขาย",
      "038-111-222", "", "77 ถ.ชายหาด ต.เพ อ.เมืองระยอง จ.ระยอง 21160", "ติดต่อผ่านฝ่ายวิศวกรรมเท่านั้น"],
  ],
};

const CONTACTS = {
  file: "import-template-contacts.xlsx",
  title: "เทมเพลตนำเข้าผู้ติดต่อ (contacts)",
  table: "public.contacts",
  intro: [
    "กรอกข้อมูลในชีต “ข้อมูล” เท่านั้น — แถวที่ 1 เป็นหัวคอลัมน์ ห้ามแก้ ห้ามสลับลำดับ ห้ามลบ",
    LEGEND,
    "ต้องนำเข้าลูกค้า (companies) ให้เสร็จก่อน — ผู้ติดต่อผูกกับบริษัทด้วยรหัสของลูกค้า",
    "ลำดับการจับคู่บริษัท: customer_code → tax_id → company_name (อันไหนกรอกก่อนใช้อันนั้น)",
    "ลูกค้าเดิมในระบบส่วนใหญ่ไม่มี customer_code แต่มี tax_id — ถ้าผูกกับลูกค้าเดิม แนะนำให้ใช้ tax_id",
    "ชื่อ-นามสกุลแยกกันคนละช่อง (first_name / last_name) เพราะระบบเก็บแยกกัน",
    "ผู้ติดต่อ 1 คนผูกได้ 1 บริษัทผ่านเทมเพลตนี้ — ถ้าคนเดียวดูแลหลายบริษัท ให้ผูกบริษัทเพิ่มในแอปทีหลัง",
  ],
  cols: [
    { key: "first_name", req: true, type: "ข้อความ", width: 18,
      desc: "ชื่อจริง — ถ้าเว้นว่างแถวนั้นจะถูกข้าม" },
    { key: "last_name", type: "ข้อความ", width: 18, desc: "นามสกุล" },
    { key: "tax_id", rec: true, type: "ข้อความ", width: 18, fmt: "text",
      desc: "เลขผู้เสียภาษีของบริษัทที่สังกัด — วิธีจับคู่ที่ครอบคลุมที่สุดสำหรับลูกค้าเดิม (26 จาก 31 รายมีเลขนี้)" },
    { key: "customer_code", type: "ข้อความ", width: 16,
      desc: "รหัสลูกค้าของบริษัทที่สังกัด — ถ้ากรอกจะใช้จับคู่ก่อน tax_id" },
    { key: "company_name", type: "ข้อความ", width: 32,
      desc: "ชื่อบริษัทที่สังกัด — ใช้จับคู่เมื่อไม่ได้ใส่ทั้ง customer_code และ tax_id ต้องสะกดตรงกับที่มีในระบบเป๊ะๆ" },
    { key: "title", type: "ข้อความ", width: 22, desc: "ตำแหน่งงาน เช่น ผู้จัดการฝ่ายวิศวกรรม" },
    { key: "phone", type: "ข้อความ", width: 16, fmt: "text",
      desc: "เบอร์โทร — ตั้งรูปแบบช่องเป็น Text ไว้แล้ว เลข 0 นำหน้าจะไม่หาย" },
    { key: "email", type: "อีเมล", width: 28, desc: "อีเมล" },
    { key: "notes", type: "ข้อความ", width: 30, desc: "หมายเหตุ เช่น ช่วงเวลาที่ติดต่อสะดวก" },
  ],
  examples: [
    ["สมชาย", "ใจดี", "0105536000123", "GS20260012", "บริษัท ไทยรุ่งเรือง ปิโตรเลียม จำกัด",
      "ผู้จัดการฝ่ายวิศวกรรม", "0812345678", "somchai@example.co.th", "ติดต่อสะดวก จ-ศ ช่วงบ่าย"],
    ["วราภรณ์", "ศรีสุข", "0105551000456", "", "ห้างหุ้นส่วนจำกัด เอ็นเนอร์ยี่ พลัส",
      "เจ้าหน้าที่จัดซื้อ", "089-876-5432", "waraporn@example.co.th", "จับคู่ด้วย tax_id เพราะไม่มีรหัสลูกค้า"],
    ["คุณโก้", "", "", "", "บริษัท สุขสบาย เซอร์วิส จำกัด",
      "หัวหน้าช่างอาคาร", "0818772323", "", "ไม่มีนามสกุลในข้อมูลเดิม — จับคู่ด้วยชื่อบริษัท"],
  ],
};

const SITES = {
  file: "import-template-sites.xlsx",
  title: "เทมเพลตนำเข้าไซต์งาน (sites)",
  table: "public.sites",
  intro: [
    "กรอกข้อมูลในชีต “ข้อมูล” เท่านั้น — แถวที่ 1 เป็นหัวคอลัมน์ ห้ามแก้ ห้ามสลับลำดับ ห้ามลบ",
    LEGEND,
    "ดูตัวอย่างการกรอกได้ที่ชีต “ตัวอย่าง” — ห้ามกรอกข้อมูลจริงลงในชีตนั้น",
    "ลำดับการจับคู่บริษัท: customer_code → tax_id → company_name — บริษัทต้องมีอยู่ในระบบแล้ว",
    "ลูกค้าเดิมในระบบส่วนใหญ่ไม่มี customer_code แต่มี tax_id — ถ้าผูกกับลูกค้าเดิม แนะนำให้ใช้ tax_id",
  ],
  cols: [
    { key: "name", req: true, type: "ข้อความ", width: 30,
      desc: "ชื่อไซต์งาน เช่น “PT สันทราย เชียงใหม่” — ถ้าเว้นว่างแถวนั้นจะถูกข้าม" },
    { key: "tax_id", rec: true, type: "ข้อความ", width: 18, fmt: "text",
      desc: "เลขผู้เสียภาษีของบริษัทเจ้าของไซต์ — วิธีจับคู่ที่ครอบคลุมที่สุดสำหรับลูกค้าเดิม" },
    { key: "customer_code", type: "ข้อความ", width: 16,
      desc: "รหัสลูกค้าของบริษัทเจ้าของไซต์ — ถ้ากรอกจะใช้จับคู่ก่อน tax_id" },
    { key: "company_name", type: "ข้อความ", width: 30,
      desc: "ชื่อบริษัทลูกค้า — ใช้จับคู่เมื่อไม่ได้ใส่ทั้ง customer_code และ tax_id ต้องสะกดตรงกับที่มีในระบบเป๊ะๆ" },
    { key: "address", type: "ข้อความ", width: 42,
      desc: "ที่อยู่ไซต์งานแบบเต็ม (ใส่ในช่องเดียว ขึ้นบรรทัดใหม่ด้วย Alt+Enter ได้) · ถ้ามีแต่พิกัด ใช้รูปแบบเดิมที่ใช้อยู่ได้เลย เช่น “พิกัด 18.871070, 98.980124”" },
    { key: "map_url", type: "URL", width: 34,
      desc: "ลิงก์ Google Maps ของไซต์ ช่างจะกดเปิดนำทางจากหน้าใบงานได้เลย" },
    { key: "contact_name", type: "ข้อความ", width: 22,
      desc: "ชื่อผู้ติดต่อประจำไซต์ (ชื่อ เว้นวรรค นามสกุล) ต้องเป็นผู้ติดต่อที่มีอยู่แล้วในระบบ" },
    { key: "contact_phone", type: "ข้อความ", width: 16, fmt: "text",
      desc: "เบอร์ผู้ติดต่อ — ใช้ช่วยแยกกรณีชื่อซ้ำกัน ไม่ได้บันทึกลงไซต์โดยตรง" },
    { key: "notes", type: "ข้อความ", width: 34, desc: "หมายเหตุอื่นๆ เช่น เงื่อนไขการเข้าพื้นที่ เวลาเปิด-ปิด" },
  ],
  examples: [
    ["PT บางปู สมุทรปราการ", "0105536000123", "GS20260012", "บริษัท ไทยรุ่งเรือง ปิโตรเลียม จำกัด",
      "88/9 ม.4 ถ.สุขุมวิท ต.บางปูใหม่ อ.เมือง จ.สมุทรปราการ 10280",
      "https://maps.app.goo.gl/xxxxxxxx", "สมชาย ใจดี", "0812345678", "เข้าพื้นที่ได้ จ-ศ 08:00-17:00 ต้องแจ้ง รปภ. ล่วงหน้า 1 วัน"],
    ["คลังสินค้าลาดกระบัง", "0105551000456", "", "ห้างหุ้นส่วนจำกัด เอ็นเนอร์ยี่ พลัส",
      "159 ซ.ฉลองกรุง 31 แขวงลำปลาทิว เขตลาดกระบัง กรุงเทพฯ 10520",
      "", "วราภรณ์ ศรีสุข", "089-876-5432", "จับคู่บริษัทด้วย tax_id"],
    ["สาขาระยอง (อาคาร A)", "", "", "บริษัท สุขสบาย เซอร์วิส จำกัด",
      "พิกัด 12.681940, 101.276360",
      "", "", "", "มีแต่พิกัด ไม่มีที่อยู่เต็ม"],
  ],
};

const ASSETS = {
  file: "import-template-assets.xlsx",
  title: "เทมเพลตนำเข้า Asset (equipment)",
  table: "public.equipment",
  intro: [
    "กรอกข้อมูลในชีต “ข้อมูล” เท่านั้น — แถวที่ 1 เป็นหัวคอลัมน์ ห้ามแก้ ห้ามสลับลำดับ ห้ามลบ",
    LEGEND,
    "ต้องนำเข้าไซต์งานให้เสร็จก่อน — ทุก Asset ต้องผูกกับไซต์ที่มีอยู่แล้ว (จับคู่ด้วย site_name)",
    "รหัส Asset (AS-0001, AS-0002, …) ระบบออกให้อัตโนมัติ ไม่ต้องกรอกและไม่มีคอลัมน์นี้ในเทมเพลต",
    "asset_type = object ให้กรอก serial_number / asset_type = project ให้กรอก project_number (อีกช่องระบบจะล้างทิ้ง)",
    "ช่องวันที่เป็นรูปแบบข้อความ YYYY-MM-DD เช่น 2026-03-15 (ตั้งค่าคอลัมน์เป็น Text ไว้ให้แล้ว)",
  ],
  cols: [
    { key: "site_name", req: true, type: "ข้อความ", width: 28,
      desc: "ชื่อไซต์งานที่ Asset ตั้งอยู่ ต้องสะกดตรงกับไซต์ที่มีในระบบ" },
    { key: "name", req: true, type: "ข้อความ", width: 30,
      desc: "ชื่อ Asset เช่น “อินเวอร์เตอร์ตัวที่ 1” หรือชื่อโครงการ" },
    { key: "asset_type", req: true, type: "ตัวเลือก", width: 13,
      list: ["object", "project"],
      desc: "object = อุปกรณ์ชิ้นจริง ระบุด้วย serial_number · project = โครงการ ระบุด้วย project_number" },
    { key: "category", req: true, type: "ตัวเลือก", width: 14,
      list: ["solar_panel", "inverter", "ev_charger", "battery", "meter", "other"],
      desc: "ประเภท: solar_panel = แผงโซลาร์, inverter = อินเวอร์เตอร์, ev_charger = ตู้ชาร์จ EV, battery = แบตเตอรี่, meter = มิเตอร์, other = อื่นๆ" },
    { key: "brand", type: "ข้อความ", width: 16, desc: "ยี่ห้อ เช่น Huawei, Growatt, Delta" },
    { key: "model", type: "ข้อความ", width: 20, desc: "รุ่น เช่น SUN2000-100KTL" },
    { key: "serial_number", type: "ข้อความ", width: 22,
      desc: "S/N ของอุปกรณ์ — ใช้เฉพาะ asset_type = object (ไม่บังคับให้ไม่ซ้ำ เพราะคนละยี่ห้อ S/N ซ้ำกันได้)" },
    { key: "project_number", type: "ข้อความ", width: 18,
      desc: "เลขที่โครงการ — ใช้เฉพาะ asset_type = project" },
    { key: "group_name", type: "ข้อความ", width: 18,
      desc: "ชื่อกลุ่ม Asset ภายในไซต์ เช่น “อาคาร A” — ถ้ายังไม่มีกลุ่มนี้ในไซต์ ระบบจะไม่ผูกให้" },
    { key: "install_date", type: "วันที่ YYYY-MM-DD", width: 15, fmt: "text",
      desc: "วันที่ติดตั้ง" },
    { key: "warranty_start", type: "วันที่ YYYY-MM-DD", width: 16, fmt: "text",
      desc: "วันที่เริ่มประกัน (ถ้าเว้นว่างจะไม่คำนวณวันหมดประกันให้)" },
    { key: "warranty_months", type: "จำนวนเต็ม", width: 15,
      desc: "อายุประกันเป็นเดือน เช่น 60 = 5 ปี — วันหมดประกันคำนวณจาก warranty_start + จำนวนเดือนนี้" },
    { key: "status", type: "ตัวเลือก", width: 14,
      list: ["operational", "degraded", "down", "retired"],
      desc: "สถานะเครื่อง: operational = ใช้งานได้, degraded = พอใช้งานได้, down = ใช้งานไม่ได้, retired = ปลดระวาง · เว้นว่าง = operational" },
    { key: "notes", type: "ข้อความ", width: 30, desc: "หมายเหตุ" },
  ],
  examples: [
    ["PT บางปู สมุทรปราการ", "อินเวอร์เตอร์ตัวที่ 1", "object", "inverter", "Huawei", "SUN2000-100KTL-M1",
      "HV2340019876", "", "อาคาร A", "2024-06-12", "2024-06-12", "60", "operational", ""],
    ["PT บางปู สมุทรปราการ", "ตู้เติมลมโครงเหล็ก-Outdoor", "object", "other", "G5", "",
      "6972220250521", "", "อาคาร A", "2024-06-12", "2024-06-12", "24", "operational", "ประเภทที่ไม่เข้าพวกให้ใช้ other"],
    ["คลังสินค้าลาดกระบัง", "โครงการติดตั้งโซลาร์ 1.2 MW", "project", "other", "", "",
      "", "PRJ-2024-0087", "", "2024-11-01", "2024-11-01", "60", "operational", "asset_type = project จึงกรอก project_number แทน serial_number"],
    ["สาขาระยอง (อาคาร A)", "ตู้ชาร์จ EV จุดที่ 3", "object", "ev_charger", "Delta", "AC Max 22kW",
      "DL2412000455", "", "", "2025-02-20", "2025-02-20", "24", "degraded", "จอแสดงผลมีปัญหา รอเปลี่ยนอะไหล่"],
  ],
};

const SERVICE_CONTRACTS = {
  file: "import-template-service-contracts.xlsx",
  title: "เทมเพลตนำเข้าสัญญาบริการ (service_contracts)",
  table: "public.service_contracts",
  intro: [
    "กรอกข้อมูลในชีต “ข้อมูล” เท่านั้น — แถวที่ 1 เป็นหัวคอลัมน์ ห้ามแก้ ห้ามสลับลำดับ ห้ามลบ",
    LEGEND,
    "ควรนำเข้าไซต์งานก่อน เพื่อให้ site_name จับคู่ได้",
    "ลำดับการจับคู่บริษัท: customer_code → tax_id → company_name",
    "ช่างในระบบบางคนมีแต่ชื่อไม่มีนามสกุล (เช่น “ธนวัฒน์”) — technician_name ต้องสะกดตรงกับที่มีในระบบ",
    "ไม่มีคอลัมน์ end_date — ระบบคำนวณให้เอง = start_date + (duration_years × 12) เดือน",
    "รอบเข้าบริการ (service_visits) ระบบสร้างให้อัตโนมัติ = frequency_per_year × duration_years รอบ",
    "  เช่น 2 ครั้ง/ปี × 5 ปี = 10 รอบ ห่างกันรอบละ 6 เดือน นับจาก start_date",
    "ช่องวันที่เป็นรูปแบบข้อความ YYYY-MM-DD เช่น 2026-03-15 (ตั้งค่าคอลัมน์เป็น Text ไว้ให้แล้ว)",
  ],
  cols: [
    { key: "title", req: true, type: "ข้อความ", width: 34,
      desc: "ชื่อสัญญา เช่น “สัญญาล้างแผง โรงงานบางปู 5 ปี”" },
    { key: "tax_id", rec: true, type: "ข้อความ", width: 18, fmt: "text",
      desc: "เลขผู้เสียภาษีของบริษัทคู่สัญญา — วิธีจับคู่ที่ครอบคลุมที่สุดสำหรับลูกค้าเดิม" },
    { key: "customer_code", type: "ข้อความ", width: 16,
      desc: "รหัสลูกค้าของบริษัทคู่สัญญา — ถ้ากรอกจะใช้จับคู่ก่อน tax_id" },
    { key: "company_name", type: "ข้อความ", width: 30,
      desc: "ชื่อบริษัทคู่สัญญา — ใช้เมื่อไม่ได้ใส่ทั้ง customer_code และ tax_id" },
    { key: "site_name", type: "ข้อความ", width: 28,
      desc: "ชื่อไซต์งานที่เข้าบริการ ต้องสะกดตรงกับไซต์ที่มีในระบบ" },
    { key: "service_type", req: true, type: "ตัวเลือก", width: 16,
      list: ["panel_cleaning", "filter_cleaning", "inspection", "maintenance", "other"],
      desc: "ประเภทงาน: panel_cleaning = ล้างแผงโซลาร์, filter_cleaning = ล้างฟิลเตอร์ (EV), inspection = ตรวจเช็กระบบ, maintenance = บำรุงรักษา, other = อื่นๆ · เว้นว่าง = panel_cleaning" },
    { key: "start_date", req: true, type: "วันที่ YYYY-MM-DD", width: 15, fmt: "text",
      desc: "วันเริ่มสัญญา — ใช้เป็นจุดตั้งต้นของทุกรอบเข้าบริการ" },
    { key: "frequency_per_year", type: "จำนวนเต็ม", width: 17,
      desc: "จำนวนครั้งที่เข้าบริการต่อปี เช่น 2 = ทุก 6 เดือน, 4 = ทุก 3 เดือน · เว้นว่าง = 2" },
    { key: "duration_years", type: "ตัวเลข", width: 14,
      desc: "อายุสัญญาเป็นปี ใส่ทศนิยม 1 ตำแหน่งได้ เช่น 2.5 · เว้นว่าง = 5" },
    { key: "technician_name", type: "ข้อความ", width: 20,
      desc: "ชื่อช่างผู้รับผิดชอบ ต้องตรงกับรายชื่อช่างในระบบ" },
    { key: "board_key", type: "ตัวเลือก", width: 16,
      list: ["unigreen", "product_sales", "services_sales"],
      desc: "แผนก/บอร์ดที่ดูแลสัญญานี้ · ค่าที่ไม่อยู่ในรายการจะถูกล้างเป็นว่าง" },
    { key: "status", type: "ตัวเลือก", width: 13,
      list: ["active", "completed", "cancelled"],
      desc: "สถานะสัญญา: active = ใช้งานอยู่, completed = จบสัญญา, cancelled = ยกเลิก · เว้นว่าง = active" },
    { key: "notes", type: "ข้อความ", width: 30, desc: "หมายเหตุ เช่น เงื่อนไขราคา หรือข้อตกลงพิเศษ" },
  ],
  examples: [
    ["สัญญาล้างแผง PT บางปู 5 ปี", "0105536000123", "GS20260012", "บริษัท ไทยรุ่งเรือง ปิโตรเลียม จำกัด",
      "PT บางปู สมุทรปราการ", "panel_cleaning", "2026-01-15", "2", "5", "ธนวัฒน์", "unigreen", "active", "ราคาเหมารวมค่าน้ำ"],
    ["สัญญา PM ระบบไฟฟ้า ลาดกระบัง", "0105551000456", "", "ห้างหุ้นส่วนจำกัด เอ็นเนอร์ยี่ พลัส",
      "คลังสินค้าลาดกระบัง", "maintenance", "2026-03-01", "4", "3", "เฉลิมเกียรติ ศรีสว่าง", "services_sales", "active", ""],
    ["สัญญาล้างฟิลเตอร์ตู้ชาร์จ ระยอง", "", "", "บริษัท สุขสบาย เซอร์วิส จำกัด",
      "สาขาระยอง (อาคาร A)", "filter_cleaning", "2025-09-01", "2", "2.5", "", "product_sales", "active", "เริ่มหลังส่งมอบงานติดตั้ง"],
  ],
};

// ---------------------------------------------------------------------------
//  Minimal OOXML writer
// ---------------------------------------------------------------------------

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

function colName(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** A cell: string (inline), {n: number}, or null for blank. `s` = style index. */
function cellXml(ref, value, style) {
  const s = style ? ` s="${style}"` : "";
  if (value == null || value === "") return `<c r="${ref}"${s}/>`;
  if (typeof value === "object" && "n" in value)
    return `<c r="${ref}"${s}><v>${value.n}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

/**
 * rows: [{ height?, cells: [{v, s}] }]
 * cols: [{ width, style? }]
 */
function sheetXml({ cols = [], rows = [], freezeRows = 0, autoFilter, merges = [], validations = [] }) {
  const lastCol = colName(Math.max(1, cols.length));
  const dim = `A1:${lastCol}${Math.max(1, rows.length)}`;

  const pane = freezeRows
    ? `<pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/>` +
      `<selection pane="bottomLeft" activeCell="A${freezeRows + 1}" sqref="A${freezeRows + 1}"/>`
    : "";

  const colsXml = cols.length
    ? `<cols>${cols
        .map((c, i) =>
          `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"` +
          (c.style ? ` style="${c.style}"` : "") + "/>")
        .join("")}</cols>`
    : "";

  const rowsXml = rows
    .map((r, ri) => {
      const n = ri + 1;
      const h = r.height ? ` ht="${r.height}" customHeight="1"` : "";
      const cells = (r.cells || [])
        .map((c, ci) => (c == null ? "" : cellXml(`${colName(ci + 1)}${n}`, c.v, c.s)))
        .join("");
      return `<row r="${n}"${h}>${cells}</row>`;
    })
    .join("");

  const afXml = autoFilter ? `<autoFilter ref="${autoFilter}"/>` : "";
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
    : "";
  const dvXml = validations.length
    ? `<dataValidations count="${validations.length}">${validations
        .map(
          (d) =>
            `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1"` +
            ` errorTitle="ค่าไม่ถูกต้อง" error="กรุณาเลือกจากรายการที่กำหนด" sqref="${d.sqref}">` +
            `<formula1>&quot;${esc(d.values.join(","))}&quot;</formula1></dataValidation>`
        )
        .join("")}</dataValidations>`
    : "";

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="${dim}"/>` +
    `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    colsXml +
    `<sheetData>${rowsXml}</sheetData>` +
    afXml + mergeXml + dvXml +
    `</worksheet>`
  );
}

// Style indices used below (see cellXfs order in STYLES).
const S = {
  DEFAULT: 0,
  HEAD_OPT: 1,   // green header
  HEAD_REQ: 2,   // orange header — required column
  TEXT: 3,       // body cell forced to Text format (dates, phones, tax ids)
  BODY: 4,       // plain body cell with border
  NOTE: 5,       // italic grey
  TITLE: 6,      // large bold title
  GUIDE_HEAD: 7, // guide table header
  WRAP: 8,       // bordered + wrapped body cell
  EX_BODY: 9,    // example row cell (light grey fill)
  HEAD_REC: 10,  // amber header — optional, but other templates match on it
};

/** Header fill for a column, and how the guide sheet labels it. */
const headStyle = (c) => (c.req ? S.HEAD_REQ : c.rec ? S.HEAD_REC : S.HEAD_OPT);
const headNeed = (c) => (c.req ? "ใช่" : c.rec ? "แนะนำ" : "—");

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="@"/></numFmts>` +
  `<fonts count="5">` +
  `<font><sz val="11"/><color rgb="FF111827"/><name val="Calibri"/><family val="2"/></font>` +
  `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>` +
  `<font><b/><sz val="11"/><color rgb="FF111827"/><name val="Calibri"/><family val="2"/></font>` +
  `<font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>` +
  `<font><b/><sz val="14"/><color rgb="FF111827"/><name val="Calibri"/><family val="2"/></font>` +
  `</fonts>` +
  `<fills count="6">` +
  `<fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF15803D"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFC2410C"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFB45309"/><bgColor indexed="64"/></patternFill></fill>` +
  `</fills>` +
  `<borders count="2">` +
  `<border><left/><right/><top/><bottom/><diagonal/></border>` +
  `<border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right>` +
  `<top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>` +
  `</borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="11">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>` +
  `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>` +
  `<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>` +
  `<xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

// ---------------------------------------------------------------------------
//  ZIP writer (store the parts with raw deflate; fixed timestamp = stable bytes)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

const DOS_TIME = 0; // 00:00:00
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1; // 2020-01-01

function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const raw = Buffer.from(data, "utf8");
    const comp = deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6); // UTF-8 names
    lh.writeUInt16LE(8, 8);      // deflate
    lh.writeUInt16LE(DOS_TIME, 10);
    lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, comp);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(DOS_TIME, 12);
    ch.writeUInt16LE(DOS_DATE, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(0, 38); // external attrs
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + comp.length;
  }

  const central = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, central, eocd]);
}

// ---------------------------------------------------------------------------
//  Workbook assembly
// ---------------------------------------------------------------------------

const SHEET_DATA = "ข้อมูล";
const SHEET_EXAMPLE = "ตัวอย่าง";
const SHEET_GUIDE = "คำอธิบาย";
const LAST_DATA_ROW = 2000;

function buildDataSheet(spec) {
  const cols = spec.cols.map((c) => ({
    width: c.width,
    style: c.fmt === "text" ? S.TEXT : undefined,
  }));
  const header = { height: 32, cells: spec.cols.map((c) => ({ v: c.key, s: headStyle(c) })) };
  const validations = spec.cols
    .map((c, i) =>
      c.list ? { sqref: `${colName(i + 1)}2:${colName(i + 1)}${LAST_DATA_ROW}`, values: c.list } : null)
    .filter(Boolean);

  return sheetXml({
    cols,
    rows: [header],
    freezeRows: 1,
    autoFilter: `A1:${colName(spec.cols.length)}1`,
    validations,
  });
}

function buildExampleSheet(spec) {
  const cols = spec.cols.map((c) => ({ width: c.width }));
  const rows = [
    { height: 32, cells: spec.cols.map((c) => ({ v: c.key, s: headStyle(c) })) },
    ...spec.examples.map((ex) => ({
      cells: spec.cols.map((_, i) => ({ v: ex[i] ?? "", s: S.EX_BODY })),
    })),
    { cells: [] },
    { cells: [{ v: "แถวตัวอย่างข้างบนมีไว้ดูรูปแบบเท่านั้น — กรอกข้อมูลจริงที่ชีต “" + SHEET_DATA + "”", s: S.NOTE }] },
  ];
  return sheetXml({ cols, rows, freezeRows: 1 });
}

function buildGuideSheet(spec) {
  const cols = [{ width: 5 }, { width: 22 }, { width: 10 }, { width: 20 }, { width: 78 }];
  const rows = [
    { height: 24, cells: [{ v: spec.title, s: S.TITLE }] },
    { cells: [{ v: `ปลายทาง: ตาราง ${spec.table} — 1 แถว = 1 รายการ`, s: S.NOTE }] },
    { cells: [] },
    ...spec.intro.map((t) => ({ cells: [{ v: t, s: S.NOTE }] })),
    { cells: [] },
    {
      height: 22,
      cells: [
        { v: "คอลัมน์", s: S.GUIDE_HEAD },
        { v: "ชื่อหัวคอลัมน์", s: S.GUIDE_HEAD },
        { v: "จำเป็น", s: S.GUIDE_HEAD },
        { v: "ชนิดข้อมูล", s: S.GUIDE_HEAD },
        { v: "คำอธิบาย", s: S.GUIDE_HEAD },
      ],
    },
    ...spec.cols.map((c, i) => ({
      cells: [
        { v: colName(i + 1), s: S.BODY },
        { v: c.key, s: S.BODY },
        { v: headNeed(c), s: S.BODY },
        { v: c.list ? `ตัวเลือก: ${c.list.join(" / ")}` : c.type, s: S.WRAP },
        { v: c.desc, s: S.WRAP },
      ],
    })),
  ];
  return sheetXml({ cols, rows });
}

function buildWorkbook(spec) {
  const sheets = [
    { name: SHEET_DATA, xml: buildDataSheet(spec) },
    { name: SHEET_EXAMPLE, xml: buildExampleSheet(spec) },
    { name: SHEET_GUIDE, xml: buildGuideSheet(spec) },
  ];

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    sheets
      .map((_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join("") +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"` +
    ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>` +
    sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    `</sheets></workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets
      .map((_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join("") +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  return zip([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rootRels },
    { name: "xl/workbook.xml", data: workbook },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRels },
    { name: "xl/styles.xml", data: STYLES },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: s.xml })),
  ]);
}

/** An example row that is short or long would silently shift every cell after it. */
function checkSpec(spec) {
  const n = spec.cols.length;
  spec.examples.forEach((ex, i) => {
    if (ex.length !== n)
      throw new Error(`${spec.file}: แถวตัวอย่างที่ ${i + 1} มี ${ex.length} ค่า แต่มี ${n} คอลัมน์`);
  });
  const dup = spec.cols.map((c) => c.key).filter((k, i, a) => a.indexOf(k) !== i);
  if (dup.length) throw new Error(`${spec.file}: ชื่อคอลัมน์ซ้ำ — ${dup.join(", ")}`);
}

mkdirSync(OUT_DIR, { recursive: true });
// Emitted in the order they must be imported.
for (const spec of [COMPANIES, CONTACTS, SITES, ASSETS, SERVICE_CONTRACTS]) {
  checkSpec(spec);
  const out = join(OUT_DIR, spec.file);
  writeFileSync(out, buildWorkbook(spec));
  console.log(`✓ ${spec.file}  (${spec.cols.length} คอลัมน์, ${spec.examples.length} แถวตัวอย่าง)`);
}
