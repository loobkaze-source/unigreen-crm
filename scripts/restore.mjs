// Restores the business tables (and storage objects) from a backup JSON into a
// TARGET Supabase project. Used to move the project between regions.
//
// Run order for a region move:
//   1. new project  ->  paste backups/schema-all.sql       (schema + buckets)
//   2. new project  ->  paste backups/restore-users.sql    (auth users, org, memberships)
//   3. this script                                          (everything else + files)
//
// Usage (PowerShell), target credentials passed as env vars so they never end
// up in a file or in shell history alongside the source project's:
//   $env:RESTORE_URL="https://<new-ref>.supabase.co"
//   $env:RESTORE_KEY="sb_secret_..."
//   node scripts/restore.mjs --confirm
//
// Without --confirm it does a dry run and only prints what it would write.
import { readFileSync, readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const CONFIRM = process.argv.includes("--confirm");

const env = Object.fromEntries(
  readFileSync("c:/CRM/.env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const SRC_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SRC_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const DST_URL = process.env.RESTORE_URL;
const DST_KEY = process.env.RESTORE_KEY;

if (!DST_URL || !DST_KEY) {
  console.error("set RESTORE_URL and RESTORE_KEY (the NEW project's url + secret key)");
  process.exit(1);
}
if (DST_URL.replace(/\/$/, "") === (SRC_URL || "").replace(/\/$/, "")) {
  console.error("REFUSING: target is the same project as the source in .env.local");
  process.exit(1);
}

// Parent-before-child. organizations / profiles / organization_members are NOT
// here — restore-users.sql creates those together with the auth users.
const ORDER = [
  "stages", "companies", "contacts", "contact_companies", "leads", "deals",
  "activities", "sites", "asset_groups", "equipment", "products", "technicians",
  "cases", "case_attachments", "case_assets",
  "work_orders", "work_order_items", "work_order_assets", "work_order_photos",
  "work_order_parts",
  "service_contracts", "service_visits", "warranties", "board_assignments",
];

const dir = "c:/CRM/backups";
const file = readdirSync(dir)
  .filter((f) => f.startsWith("unicloud-backup-") && f.endsWith(".json"))
  .sort()
  .pop();
const backup = JSON.parse(readFileSync(`${dir}/${file}`, "utf8"));

console.log(`backup : ${file}`);
console.log(`source : ${SRC_URL}`);
console.log(`target : ${DST_URL}`);
console.log(CONFIRM ? "mode   : WRITE\n" : "mode   : dry run (pass --confirm to write)\n");

const dst = createClient(DST_URL, DST_KEY, { auth: { persistSession: false } });
const src = createClient(SRC_URL, SRC_KEY, { auth: { persistSession: false } });

let failed = 0;
for (const table of ORDER) {
  const rows = backup.tables[table] ?? [];
  if (rows.length === 0) {
    console.log(`  ${table}: 0 (skip)`);
    continue;
  }
  if (!CONFIRM) {
    console.log(`  ${table}: would insert ${rows.length}`);
    continue;
  }
  // Chunked so a big table can't blow the request size.
  let done = 0;
  let err = null;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await dst.from(table).upsert(chunk, { onConflict: "id" });
    if (error) {
      err = error.message;
      break;
    }
    done += chunk.length;
  }
  if (err) {
    failed++;
    console.log(`  ${table}: FAILED after ${done}/${rows.length} — ${err}`);
  } else {
    console.log(`  ${table}: ${done}`);
  }
}

// ---- storage objects -------------------------------------------------------
const FILES = [
  ...(backup.tables.work_order_photos ?? []).map((r) => ["wo-photos", r.path]),
  ...(backup.tables.case_attachments ?? []).map((r) => ["case-files", r.path]),
].filter(([, p]) => p);

console.log(`\nstorage objects: ${FILES.length}`);
for (const [bucket, path] of FILES) {
  if (!CONFIRM) {
    console.log(`  would copy ${bucket}/${path}`);
    continue;
  }
  const dl = await src.storage.from(bucket).download(path);
  if (dl.error) {
    failed++;
    console.log(`  ${bucket}/${path}: DOWNLOAD FAILED — ${dl.error.message}`);
    continue;
  }
  const buf = Buffer.from(await dl.data.arrayBuffer());
  const up = await dst.storage.from(bucket).upload(path, buf, { upsert: true });
  if (up.error) {
    failed++;
    console.log(`  ${bucket}/${path}: UPLOAD FAILED — ${up.error.message}`);
  } else {
    console.log(`  ${bucket}/${path}: ${buf.length} bytes`);
  }
}

console.log(failed === 0 ? "\n✅ done, no errors" : `\n⚠️  ${failed} step(s) failed — see above`);
process.exit(failed === 0 ? 0 : 1);
