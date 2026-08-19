/**
 * Shape of the bulk-import spreadsheets — shared by the two scripts that care:
 *
 *   gen-import-templates.mjs   writes the blank .xlsx templates from these
 *   import-xlsx.mjs            reads a filled-in .xlsx back and loads it
 *
 * One source of truth, so a column cannot exist in the template but be unknown
 * to the importer (or the other way round).
 */

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
    { key: "asset_tag", type: "ข้อความ", width: 16,
      desc: "เลขครุภัณฑ์ / QR Code ที่ติดอยู่บนเครื่อง เช่น Shell-001 — คนละอันกับรหัส Asset (AS-0001) ที่ระบบออกให้เอง" },
    { key: "asset_type", req: true, type: "ตัวเลือก", width: 13,
      list: ["object", "project"],
      desc: "object = อุปกรณ์ชิ้นจริง ระบุด้วย serial_number · project = โครงการ ระบุด้วย project_number" },
    { key: "category", req: true, type: "ข้อความ", width: 26,
      desc: "ชนิดเครื่อง เช่น “Probe”, “Liquid Sensor”, “Nozzle (หัวฉีด)” — พิมพ์ได้อิสระ ไม่จำกัดตัวเลือก · ค่าที่ระบบมีคำแปลไทยให้: solar_panel = แผงโซลาร์, inverter = อินเวอร์เตอร์, ev_charger = ตู้ชาร์จ EV, battery = แบตเตอรี่, meter = มิเตอร์, other = อื่นๆ" },
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
    ["PT บางปู สมุทรปราการ", "อินเวอร์เตอร์ตัวที่ 1", "INV-001", "object", "inverter", "Huawei", "SUN2000-100KTL-M1",
      "HV2340019876", "", "อาคาร A", "2024-06-12", "2024-06-12", "60", "operational", ""],
    ["PT บางปู สมุทรปราการ", "ตู้เติมลมโครงเหล็ก-Outdoor", "AIR-014", "object", "other", "G5", "",
      "6972220250521", "", "อาคาร A", "2024-06-12", "2024-06-12", "24", "operational", "ประเภทที่ไม่เข้าพวกให้ใช้ other"],
    ["คลังสินค้าลาดกระบัง", "โครงการติดตั้งโซลาร์ 1.2 MW", "", "project", "other", "", "",
      "", "PRJ-2024-0087", "", "2024-11-01", "2024-11-01", "60", "operational", "asset_type = project จึงกรอก project_number แทน serial_number"],
    ["สาขาระยอง (อาคาร A)", "ตู้ชาร์จ EV จุดที่ 3", "EV-003", "object", "ev_charger", "Delta", "AC Max 22kW",
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

/** In the order they must be imported — parents before children. */
export const SPECS = [COMPANIES, CONTACTS, SITES, ASSETS, SERVICE_CONTRACTS];

export { LEGEND, COMPANIES, CONTACTS, SITES, ASSETS, SERVICE_CONTRACTS };

/** Identify which template a sheet's header row came from. */
export function specForHeaders(headers) {
  const got = headers.map((h) => String(h ?? "").trim()).filter(Boolean);
  let best = null;
  for (const spec of SPECS) {
    const keys = spec.cols.map((c) => c.key);
    const hit = keys.filter((k) => got.includes(k)).length;
    const score = hit / keys.length;
    if (score > (best?.score ?? 0)) best = { spec, score, missing: keys.filter((k) => !got.includes(k)) };
  }
  return best && best.score >= 0.6 ? best : null;
}
