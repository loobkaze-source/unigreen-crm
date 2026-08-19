/**
 * Builds one of our import workbooks from a column spec — the same three
 * sheets whether it comes out blank (gen-import-templates.mjs) or already
 * filled with converted rows (convert-venio.mjs).
 *
 *   ข้อมูล     the sheet people fill in / that the importer reads
 *   ตัวอย่าง    worked examples, kept off the data sheet so they cannot be imported
 *   คำอธิบาย   generated from the spec, so it cannot drift from the headers
 */
import { S, colName, sheetXml, headStyle, headNeed, buildXlsx } from "./xlsx-write.mjs";

export const SHEET_DATA = "ข้อมูล";
export const SHEET_EXAMPLE = "ตัวอย่าง";
export const SHEET_GUIDE = "คำอธิบาย";

/** Dropdowns cover this many rows; beyond it Excel simply stops validating. */
const VALIDATION_ROWS = 2000;

/**
 * @param spec  one entry from import-schema.mjs
 * @param data  rows as objects keyed by column key — [] for a blank template
 */
function buildDataSheet(spec, data) {
  const cols = spec.cols.map((c) => ({
    width: c.width,
    style: c.fmt === "text" ? S.TEXT : undefined,
  }));
  const header = { height: 32, cells: spec.cols.map((c) => ({ v: c.key, s: headStyle(c) })) };
  const body = data.map((row) => ({
    cells: spec.cols.map((c) => ({ v: row[c.key] ?? "", s: c.fmt === "text" ? S.TEXT : S.BODY })),
  }));
  const validations = spec.cols
    .map((c, i) =>
      c.list
        ? {
            sqref: `${colName(i + 1)}2:${colName(i + 1)}${Math.max(VALIDATION_ROWS, data.length + 1)}`,
            values: c.list,
          }
        : null)
    .filter(Boolean);

  return sheetXml({
    cols,
    rows: [header, ...body],
    freezeRows: 1,
    autoFilter: `A1:${colName(spec.cols.length)}${Math.max(1, data.length + 1)}`,
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

function buildGuideSheet(spec, extraNotes) {
  const cols = [{ width: 5 }, { width: 22 }, { width: 10 }, { width: 20 }, { width: 78 }];
  const rows = [
    { height: 24, cells: [{ v: spec.title, s: S.TITLE }] },
    { cells: [{ v: `ปลายทาง: ตาราง ${spec.table} — 1 แถว = 1 รายการ`, s: S.NOTE }] },
    { cells: [] },
    ...spec.intro.map((t) => ({ cells: [{ v: t, s: S.NOTE }] })),
    ...(extraNotes.length
      ? [{ cells: [] }, ...extraNotes.map((t) => ({ cells: [{ v: t, s: S.NOTE }] }))]
      : []),
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

/**
 * @param data        rows keyed by column key; omit for a blank template
 * @param extraNotes  extra lines for the guide sheet, e.g. where rows came from
 */
export function buildTemplateWorkbook(spec, data = [], extraNotes = []) {
  return buildXlsx([
    { name: SHEET_DATA, xml: buildDataSheet(spec, data) },
    { name: SHEET_EXAMPLE, xml: buildExampleSheet(spec) },
    { name: SHEET_GUIDE, xml: buildGuideSheet(spec, extraNotes) },
  ]);
}
