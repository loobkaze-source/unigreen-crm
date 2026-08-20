/**
 * Cuts the avatar sheet in avatar/ into one file per face.
 *
 *   node scripts/crop-avatars.mjs            # ทดลอง — บอกว่าเจอกี่รูป ตรงไหน
 *   node scripts/crop-avatars.mjs --apply    # เขียนลง public/avatars/
 *
 * The sheet is a grid of circles on one flat background, so the grid is found
 * rather than assumed: count the pixels that are not the background down each
 * column and across each row, and the gaps between the circles fall out. A
 * sheet with a different number of rows or a different margin therefore needs
 * no code change.
 *
 * Each face is cut as a square around its circle, masked back to a circle so
 * the corners are transparent, and written at 128px — twice the biggest size
 * the app puts one at, which is what a retina screen asks for.
 */
import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const SRC_DIR = "avatar";
const OUT_DIR = "public/avatars";
const SIZE = 128;
const APPLY = process.argv.includes("--apply");

const sheets = readdirSync(SRC_DIR).filter((f) => /\.(webp|png|jpe?g)$/i.test(f));
if (!sheets.length) {
  console.error(`ไม่พบไฟล์รูปใน ${SRC_DIR}/`);
  process.exit(1);
}

/** Runs of consecutive true values in a boolean array — the bands with faces. */
function bands(occupied, minLength) {
  const out = [];
  let start = -1;
  for (let i = 0; i <= occupied.length; i++) {
    if (occupied[i]) {
      if (start === -1) start = i;
    } else if (start !== -1) {
      if (i - start >= minLength) out.push([start, i - 1]);
      start = -1;
    }
  }
  return out;
}

let n = 0;
if (APPLY) mkdirSync(OUT_DIR, { recursive: true });

for (const file of sheets) {
  const path = join(SRC_DIR, file);
  const img = sharp(path).ensureAlpha();
  const { width, height } = await img.metadata();
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => (y * width + x) * 4;

  // The background is whatever the corner is; the circles never reach it.
  const bg = [data[0], data[1], data[2]];
  const isBg = (x, y) => {
    const i = at(x, y);
    return (
      Math.abs(data[i] - bg[0]) < 24 &&
      Math.abs(data[i + 1] - bg[1]) < 24 &&
      Math.abs(data[i + 2] - bg[2]) < 24
    );
  };

  const colHas = new Array(width).fill(false);
  const rowHas = new Array(height).fill(false);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isBg(x, y)) {
        colHas[x] = true;
        rowHas[y] = true;
      }
    }
  }

  const cols = bands(colHas, Math.round(width / 40));
  const rows = bands(rowHas, Math.round(height / 40));
  console.log(`${file}  ${width}×${height}  → ${cols.length} คอลัมน์ × ${rows.length} แถว = ${cols.length * rows.length} รูป`);

  for (const [y0, y1] of rows) {
    for (const [x0, x1] of cols) {
      // Square up around the circle's centre: the bands give a bounding box,
      // and a circle's box is square already bar a pixel of rounding.
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const side = Math.min(
        Math.max(x1 - x0 + 1, y1 - y0 + 1),
        width,
        height
      );
      const left = Math.max(0, Math.min(width - side, Math.round(cx - side / 2)));
      const top = Math.max(0, Math.min(height - side, Math.round(cy - side / 2)));
      n++;
      if (!APPLY) continue;

      const mask = Buffer.from(
        `<svg width="${SIZE}" height="${SIZE}"><circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2}" fill="#fff"/></svg>`
      );
      const out = join(OUT_DIR, `av-${String(n).padStart(2, "0")}.webp`);
      writeFileSync(
        out,
        await sharp(path)
          .extract({ left, top, width: side, height: side })
          .resize(SIZE, SIZE, { fit: "cover" })
          .composite([{ input: mask, blend: "dest-in" }])
          .webp({ quality: 88 })
          .toBuffer()
      );
    }
  }
}

console.log(APPLY ? `\n✓ เขียนแล้ว ${n} รูป ที่ ${OUT_DIR}/` : `\nพบ ${n} รูป — รันซ้ำด้วย --apply เพื่อเขียนไฟล์`);
