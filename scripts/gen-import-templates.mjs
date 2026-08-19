/**
 * Generates the blank bulk-import Excel templates in /import-templates.
 *
 *   node scripts/gen-import-templates.mjs
 *
 * Everything on every sheet is derived from the column specs in
 * import-schema.mjs, which import-xlsx.mjs reads back in — so a column cannot
 * exist in a template but be unknown to the importer.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SPECS } from "./import-schema.mjs";
import { buildTemplateWorkbook } from "./import-workbook.mjs";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "import-templates");

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
  writeFileSync(join(OUT_DIR, spec.file), buildTemplateWorkbook(spec));
  console.log(`✓ ${spec.file}  (${spec.cols.length} คอลัมน์, ${spec.examples.length} แถวตัวอย่าง)`);
}
