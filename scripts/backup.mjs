// Full data backup -> JSON. Run: node scripts/backup.mjs
// Uses SUPABASE_SERVICE_ROLE_KEY if present (all rows), else signs in as a
// member (RLS -> your workspace's rows). Output goes to backups/ (gitignored).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY || "";
const svcValid = SVC.length >= 40 && !/your-|placeholder/i.test(SVC);

// Optional member login for the RLS fallback (only used if no service key).
const LOGIN_EMAIL = process.env.BACKUP_EMAIL || "nudach0318@gmail.com";
const LOGIN_PW = process.env.BACKUP_PW || "123456";

const TABLES = [
  "organizations", "organization_members", "profiles", "invites",
  "stages", "companies", "contacts", "contact_companies", "leads", "deals",
  "activities", "cases", "products",
  "sites", "asset_groups", "equipment",
  "technicians", "work_orders", "work_order_items", "work_order_assets",
  "work_order_photos", "service_contracts", "service_visits", "warranties",
  "board_assignments",
];

const sb = svcValid
  ? createClient(URL, SVC, { auth: { persistSession: false } })
  : createClient(URL, ANON);

if (!svcValid) {
  const { error } = await sb.auth.signInWithPassword({ email: LOGIN_EMAIL, password: LOGIN_PW });
  if (error) {
    console.log("SIGN-IN FAILED:", error.message);
    console.log("→ ใส่ SUPABASE_SERVICE_ROLE_KEY ใน .env.local หรือ set BACKUP_EMAIL/BACKUP_PW ที่ล็อกอินได้");
    process.exit(1);
  }
  console.log("mode: member session (RLS) as", LOGIN_EMAIL);
} else {
  console.log("mode: service role (all rows)");
}

const out = { exported_at: new Date().toISOString(), source: URL, tables: {} };
let totalRows = 0;
for (const t of TABLES) {
  // paginate in case a table is large
  const rows = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await sb.from(t).select("*").range(from, from + page - 1);
    if (error) { console.log(`  ${t}: ERROR ${error.message}`); break; }
    rows.push(...(data ?? []));
    if (!data || data.length < page) break;
    from += page;
  }
  out.tables[t] = rows;
  totalRows += rows.length;
  console.log(`  ${t}: ${rows.length}`);
}

mkdirSync("c:/CRM/backups", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const file = `c:/CRM/backups/unicloud-backup-${stamp}.json`;
writeFileSync(file, JSON.stringify(out, null, 2), "utf8");
console.log(`\n✅ ${totalRows} rows -> ${file}`);
