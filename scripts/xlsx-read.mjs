/**
 * Reads a .xlsx back into rows of strings — the mirror of the writer in
 * gen-import-templates.mjs, and dependency-free for the same reason.
 *
 *   const sheet = readSheet("file.xlsx");   // { name, rows: [[cell, …], …] }
 *
 * Handles what Excel actually produces once a human has saved the file:
 * shared strings (Excel rewrites our inline strings into these on save),
 * inline strings, formula results, booleans, and numbers. Blank cells and
 * whole blank columns keep their position, so row[i] always lines up with
 * the header at column i.
 */
import { inflateRawSync } from "node:zlib";
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
//  ZIP reader
// ---------------------------------------------------------------------------

/** Returns a Map of entry name -> Buffer for every file in the archive. */
function unzip(buf) {
  // The end-of-central-directory record sits within the last 64KB + 22 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ไม่ใช่ไฟล์ zip/xlsx ที่ถูกต้อง (หา EOCD ไม่เจอ)");

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50)
      throw new Error("central directory เสียหาย");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    // The local header repeats the lengths, and they can differ from the
    // central directory's — the data offset must come from the local one.
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);

    out.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// ---------------------------------------------------------------------------
//  Just enough XML
// ---------------------------------------------------------------------------

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function unescapeXml(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X"
        ? parseInt(e.slice(2), 16)
        : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

/** Concatenated text of every <t> in a fragment (rich-text runs included). */
function textOf(fragment) {
  // <rPh> holds furigana for Japanese; it is not part of the value.
  const cleaned = fragment.replace(/<rPh[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of cleaned.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += unescapeXml(m[1]);
  return out;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const items = [];
  for (const m of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g)) {
    items.push(m[1] === undefined ? "" : textOf(m[1]));
  }
  return items;
}

/** "BC12" -> { col: 55, row: 12 } (1-based) */
function parseRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col, row: Number(m[2]) };
}

const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
};

/**
 * Excel stores dates as days since 1899-12-30 (the offset absorbs the
 * fictional 1900-02-29 that Lotus 1-2-3 believed in).
 */
export function excelSerialToYmd(n) {
  const ms = Math.round(n * 86400000);
  const d = new Date(Date.UTC(1899, 11, 30) + ms);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

function parseSheetXml(xml, shared) {
  const grid = [];
  let maxCol = 0;

  const cellRe = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  for (const m of xml.matchAll(cellRe)) {
    const tag = m[1];
    const body = m[2] ?? "";
    const at = parseRef(attr(tag, "r") ?? "");
    if (!at) continue;
    const t = attr(tag, "t");

    let value = "";
    if (t === "inlineStr") {
      value = textOf(body);
    } else if (t === "s") {
      const v = /<v>([\s\S]*?)<\/v>/.exec(body);
      value = v ? shared[Number(v[1])] ?? "" : "";
    } else if (t === "e") {
      value = ""; // #N/A and friends import as blank
    } else {
      const v = /<v>([\s\S]*?)<\/v>/.exec(body);
      let raw = v ? unescapeXml(v[1]) : "";
      if (t === "b") raw = raw === "1" ? "TRUE" : raw === "0" ? "FALSE" : raw;
      value = raw;
    }

    (grid[at.row - 1] ??= [])[at.col - 1] = value;
    if (at.col > maxCol) maxCol = at.col;
  }

  return grid.map((row) =>
    Array.from({ length: maxCol }, (_, i) => (row?.[i] ?? "").toString())
  );
}

// ---------------------------------------------------------------------------

/**
 * Reads one sheet. Prefers the sheet called `wanted`, else the first one.
 * Trailing all-blank rows are dropped; interior blank rows are kept so the
 * reported row numbers still match what the user sees in Excel.
 */
export function readSheet(path, wanted = "ข้อมูล") {
  const zip = unzip(readFileSync(path));
  const text = (name) => {
    const b = zip.get(name);
    return b ? b.toString("utf8") : null;
  };

  const wbXml = text("xl/workbook.xml");
  if (!wbXml) throw new Error("ไม่พบ xl/workbook.xml — ไฟล์อาจไม่ใช่ .xlsx");

  const relsXml = text("xl/_rels/workbook.xml.rels") ?? "";
  const rels = new Map();
  for (const m of relsXml.matchAll(/<Relationship\s([^>]*)\/>/g)) {
    const id = attr(m[1], "Id");
    let target = attr(m[1], "Target");
    if (!id || !target) continue;
    if (!target.startsWith("/")) target = `xl/${target.replace(/^\.\//, "")}`;
    rels.set(id, target.replace(/^\//, ""));
  }

  const sheets = [];
  for (const m of wbXml.matchAll(/<sheet\s([^>]*)\/>/g)) {
    sheets.push({
      name: unescapeXml(attr(m[1], "name") ?? ""),
      target: rels.get(attr(m[1], "r:id") ?? attr(m[1], "id") ?? ""),
    });
  }
  if (sheets.length === 0) throw new Error("ไฟล์นี้ไม่มีชีตเลย");

  const pick = sheets.find((s) => s.name === wanted) ?? sheets[0];
  const sheetXml = pick.target ? text(pick.target) : null;
  if (!sheetXml) throw new Error(`อ่านชีต “${pick.name}” ไม่ได้`);

  const shared = parseSharedStrings(text("xl/sharedStrings.xml"));
  const rows = parseSheetXml(sheetXml, shared);
  while (rows.length && rows[rows.length - 1].every((c) => c.trim() === "")) rows.pop();

  return { name: pick.name, sheetNames: sheets.map((s) => s.name), rows };
}
