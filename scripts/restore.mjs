// Restores the business tables (and storage objects) from a backup JSON into
// the project that .env.local currently points at. Used to move regions.
//
// Run order for a region move:
//   1. new project -> paste backups/schema-all.sql      (schema + buckets)
//   2. new project -> paste backups/restore-users.sql   (auth users, org, memberships)
//   3. point .env.local at the NEW project
//   4. this script
//
// Table rows come from the JSON, so the old project is only needed to download
// storage objects. Point SOURCE_ENV_FILE at an env file still holding the OLD
// project's credentials; omit it to skip the file copy.
//
//   $env:SOURCE_ENV_FILE="D:\some\old\.env.local"
//   node scripts/restore.mjs --confirm
//
// Without --confirm it is a dry run and writes nothing.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const CONFIRM = process.argv.includes("--confirm");

function readEnv(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

const target = readEnv("c:/CRM/.env.local");
const DST_URL = target.NEXT_PUBLIC_SUPABASE_URL;
const DST_KEY = target.SUPABASE_SERVICE_ROLE_KEY;
if (!DST_URL || !DST_KEY || DST_KEY.startsWith("your-")) {
  console.error("c:/CRM/.env.local must hold the TARGET project url + service role key");
  process.exit(1);
}

const srcFile = process.env.SOURCE_ENV_FILE;
let src = null;
if (srcFile && existsSync(srcFile)) {
  const s = readEnv(srcFile);
  if (new URL(s.NEXT_PUBLIC_SUPABASE_URL).host === new URL(DST_URL).host) {
    console.error("REFUSING: SOURCE_ENV_FILE points at the same project as the target");
    process.exit(1);
  }
  src = createClient(s.NEXT_PUBLIC_SUPABASE_URL, s.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// Parent-before-child. organizations / profiles / organization_members are not
// here — restore-users.sql creates those alongside the auth users.
const ORDER = [
  "stages", "companies", "contacts", "contact_companies", "leads", "deals",
  "activities", "sites", "asset_groups", "equipment", "products", "technicians",
  "cases", "case_attachments", "case_assets",
  "work_orders", "work_order_items", "work_order_assets", "work_order_photos",
  "work_order_parts",
  "service_contracts", "service_visits", "warranties", "board_assignments",
];

// Inserting the organization fires on_org_created (migration 0001), which seeds
// six default pipeline stages. Those are not in the backup, so drop any row the
// backup doesn't know about before restoring this table.
const PRUNE = new Set(["stages"]);

const dir = "c:/CRM/backups";
const file = readdirSync(dir)
  .filter((f) => f.startsWith("unicloud-backup-") && f.endsWith(".json"))
  .sort()
  .pop();
const backup = JSON.parse(readFileSync(`${dir}/${file}`, "utf8"));

console.log(`backup : ${file}`);
console.log(`from   : ${backup.source}`);
console.log(`target : ${DST_URL}`);
console.log(`files  : ${src ? "will copy from SOURCE_ENV_FILE" : "SKIPPED (no SOURCE_ENV_FILE)"}`);
console.log(CONFIRM ? "mode   : WRITE\n" : "mode   : dry run (pass --confirm to write)\n");

const dst = createClient(DST_URL, DST_KEY, { auth: { persistSession: false } });

let failed = 0;
for (const table of ORDER) {
  const rows = backup.tables[table] ?? [];
  if (rows.length === 0) {
    console.log(`  ${table}: 0 (skip)`);
    continue;
  }
  if (!CONFIRM) {
    console.log(`  ${table}: would insert ${rows.length}${PRUNE.has(table) ? " (+prune extras)" : ""}`);
    continue;
  }

  if (PRUNE.has(table)) {
    const keep = rows.map((r) => r.id);
    const { error, count } = await dst
      .from(table)
      .delete({ count: "exact" })
      .not("id", "in", `(${keep.join(",")})`);
    if (error) console.log(`  ${table}: prune failed — ${error.message}`);
    else if (count) console.log(`  ${table}: pruned ${count} pre-seeded row(s)`);
  }

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
  if (!CONFIRM || !src) {
    console.log(`  ${src ? "would copy" : "skip"} ${bucket}/${path}`);
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
