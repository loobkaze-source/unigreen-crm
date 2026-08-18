/**
 * Generates the bulk-import Excel templates in /import-templates.
 *
 *   node scripts/gen-import-templates.mjs
 *
 * Writes .xlsx by hand (ZIP + OOXML) so the repo needs no extra dependency.
 * Every sheet — headers, dropdowns, examples, guide — is derived from the
 * column specs in import-schema.mjs, which import-xlsx.mjs reads back in.
 */
import { deflateRawSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SPECS } from "./import-schema.mjs";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "import-templates");

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
for (const spec of SPECS) {
  checkSpec(spec);
  const out = join(OUT_DIR, spec.file);
  writeFileSync(out, buildWorkbook(spec));
  console.log(`✓ ${spec.file}  (${spec.cols.length} คอลัมน์, ${spec.examples.length} แถวตัวอย่าง)`);
}
