// Read-only: compare every table's row count in the target project against the
// backup JSON, and confirm the storage objects are readable.
import { readFileSync, readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

const dir = "c:/CRM/backups";
const file = readdirSync(dir)
  .filter((f) => f.startsWith("unicloud-backup-") && f.endsWith(".json"))
  .sort()
  .pop();
const backup = JSON.parse(readFileSync(`${dir}/${file}`, "utf8"));

console.log(`target: ${new URL(env.NEXT_PUBLIC_SUPABASE_URL).host}`);
console.log(`backup: ${file}\n`);
console.log("table                     backup  target");

let bad = 0;
for (const [t, rows] of Object.entries(backup.tables)) {
  const { count, error } = await sb.from(t).select("id", { count: "exact", head: true });
  const got = error ? "ERR" : count;
  const ok = !error && count === rows.length;
  if (!ok) bad++;
  console.log(
    `${t.padEnd(24)} ${String(rows.length).padStart(6)}  ${String(got).padStart(6)}  ${ok ? "" : "  <-- MISMATCH"}`
  );
}

// Storage: HEAD each object through the public URL.
const FILES = [
  ...(backup.tables.work_order_photos ?? []).map((r) => ["wo-photos", r.path]),
  ...(backup.tables.case_attachments ?? []).map((r) => ["case-files", r.path]),
];
let fileBad = 0;
for (const [bucket, path] of FILES) {
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
  const res = await fetch(url, { method: "HEAD" });
  if (!res.ok) {
    fileBad++;
    console.log(`file MISSING: ${bucket}/${path} (${res.status})`);
  }
}
console.log(`\nstorage: ${FILES.length - fileBad}/${FILES.length} readable`);
console.log(bad === 0 && fileBad === 0 ? "\n✅ every table and file matches" : `\n⚠️  ${bad} table mismatch, ${fileBad} missing file`);
