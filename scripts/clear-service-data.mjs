/**
 * Empties the service side back to nothing: every case and every work order,
 * with the rows and the files that hang off them.
 *
 *   node scripts/clear-service-data.mjs            # นับให้ดูก่อน ไม่ลบ
 *   node scripts/clear-service-data.mjs --apply    # ลบจริง
 *
 * Customers, sites, assets and service contracts are left alone — this is for
 * clearing out what has been keyed in while the system was being tried out,
 * not for emptying the CRM.
 *
 * The counters go too. Both codes are built from one (MRD-0826-00001 and its
 * work orders' -01, -02), and leaving them behind would start the first case
 * after a clear-out at 00003.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

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

/** Children before parents; a counter is only meaningful while its rows exist. */
const TABLES = [
  "work_order_items",
  "work_order_parts",
  "work_order_photos",
  "work_order_assets",
  "work_orders",
  "case_assets",
  "case_attachments",
  "cases",
  "case_code_counters",
  "work_order_report_counters",
];
const BUCKETS = ["case-files", "wo-photos"];

const count = async (t) => {
  const { count: n, error } = await sb.from(t).select("*", { count: "exact", head: true });
  if (error) throw new Error(`นับ ${t} ไม่ได้: ${error.message}`);
  return n ?? 0;
};

/** Everything under a bucket, walked a folder at a time. */
async function walk(bucket, prefix = "") {
  const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
  const out = [];
  for (const e of data ?? []) {
    const path = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.id === null) out.push(...(await walk(bucket, path)));
    else out.push(path);
  }
  return out;
}

console.log(APPLY ? "โหมด: ลบจริง\n" : "โหมด: ทดลอง — ใส่ --apply เพื่อลบ\n");
for (const t of TABLES) console.log(`   ${String(await count(t)).padStart(6)}  ${t}`);
const files = Object.fromEntries(await Promise.all(BUCKETS.map(async (b) => [b, await walk(b)])));
for (const b of BUCKETS) console.log(`   ${String(files[b].length).padStart(6)}  ${b} (ไฟล์)`);

if (!APPLY) {
  console.log("\nยังไม่ได้ลบอะไร — สำรองข้อมูลก่อน (node scripts/backup.mjs) แล้วรันซ้ำด้วย --apply");
  process.exit(0);
}

// A visit points at the work order that served it; unhook before the order goes.
const { error: vErr } = await sb
  .from("service_visits").update({ work_order_id: null }).not("work_order_id", "is", null);
if (vErr) throw new Error(`ปลดรอบเข้าบริการไม่ได้: ${vErr.message}`);

for (const t of TABLES) {
  // PostgREST refuses an unfiltered delete. Every one of these tables is scoped
  // to a workspace, so "has an org" is the filter that means all of them — and
  // unlike a date it holds for the counter tables, which keep no timestamps.
  const { error } = await sb.from(t).delete().not("org_id", "is", null);
  if (error) throw new Error(`ลบ ${t} ไม่ได้: ${error.message}`);
}

for (const b of BUCKETS) {
  for (let i = 0; i < files[b].length; i += 100) {
    const { error } = await sb.storage.from(b).remove(files[b].slice(i, i + 100));
    if (error) throw new Error(`ลบไฟล์ใน ${b} ไม่ได้: ${error.message}`);
  }
}

console.log("\n✓ ล้างแล้ว");
for (const t of TABLES) console.log(`   ${String(await count(t)).padStart(6)}  ${t}`);
