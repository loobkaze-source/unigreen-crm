/**
 * Merges sites that are the same station recorded twice.
 *
 *   node scripts/merge-duplicate-sites.mjs
 *   node scripts/merge-duplicate-sites.mjs --apply
 *
 * A station numbers all its machines from one code — 12658206-1, 12658206-2 —
 * so two sites whose assets carry the same eight digits are one station written
 * two ways in the legacy location field: "สุนิษารุ่งเรือง (สนญ)" and
 * "สุนิษารุ่งเรือง สำนักงานใหญ่" are the same place, and no name comparison was
 * ever going to see it.
 *
 * Assets, work orders, contracts and warranties move to the site that holds
 * more of them; the emptied duplicate goes, and whatever it knew that the
 * survivor did not — an address, a map link — is carried over first.
 *
 * Two sites under different customers are left alone even when the code
 * matches: that is a question about who the customer is, not a duplicate to
 * quietly resolve.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
/**
 * Which customer owns a station when two of them claim the same code. Without
 * it those groups are left alone, because who the customer is is a question
 * about the business rather than a duplicate to resolve quietly.
 */
const PREFER = process.argv.find((a) => a.startsWith("--prefer="))?.slice(9) ?? "";

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

const s = (v) => String(v ?? "").trim();
const norm = (v) => s(v).replace(/ํา/g, "ำ").replace(/\s+/g, " ").toLowerCase();
const { data: orgs } = await sb.from("organizations").select("id, name");
const ORG = orgs[0];

async function loadAll(table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from(table).select(columns).eq("org_id", ORG.id).range(from, from + 999);
    if (error) throw new Error(`อ่าน ${table} ไม่ได้: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

const sites = await loadAll("sites", "id, name, company_id, address, map_url, contact_id, notes");
const companies = await loadAll("companies", "id, name");
const equipment = await loadAll("equipment", "id, site_id, serial_number");
const workOrders = await loadAll("work_orders", "id, site_id");
const contracts = await loadAll("service_contracts", "id, site_id");
const warranties = await loadAll("warranties", "id, site_id");
const coName = new Map(companies.map((c) => [c.id, c.name]));

/** Tables that point at a site and have to follow it. */
const LINKED = [
  ["equipment", equipment],
  ["work_orders", workOrders],
  ["service_contracts", contracts],
  ["warranties", warranties],
];
const holdings = (id) =>
  Object.fromEntries(LINKED.map(([t, rows]) => [t, rows.filter((r) => r.site_id === id).length]));
const total = (id) => LINKED.reduce((a, [, rows]) => a + rows.filter((r) => r.site_id === id).length, 0);

// ---- one station code, more than one site -----------------------------------
const STATION = /^(\d{8})-/;
const codeOf = new Map();
for (const e of equipment) {
  const m = STATION.exec(String(e.serial_number ?? ""));
  if (!m || !e.site_id) continue;
  (codeOf.get(e.site_id) ?? codeOf.set(e.site_id, new Set()).get(e.site_id)).add(m[1]);
}

const byCode = new Map();
for (const [siteId, set] of codeOf) {
  if (set.size !== 1) continue; // a site whose machines disagree proves nothing
  const code = [...set][0];
  (byCode.get(code) ?? byCode.set(code, []).get(code)).push(siteId);
}

const groups = [];
const crossCustomer = [];
for (const [code, ids] of byCode) {
  if (ids.length < 2) continue;
  const group = ids.map((id) => sites.find((x) => x.id === id)).filter(Boolean);
  const owners = new Set(group.map((g) => g.company_id));
  if (owners.size === 1) {
    groups.push({ code, group });
    continue;
  }
  const mine = PREFER
    ? group.filter((g) => norm(coName.get(g.company_id)) === norm(PREFER))
    : [];
  // Only decisive when exactly one of the claimants is the named customer.
  if (mine.length === 1) groups.push({ code, group, keep: mine[0] });
  else crossCustomer.push({ code, group });
}

console.log(`ไซต์ ${sites.length} · เลขสถานีที่อยู่คนละไซต์ ${groups.length + crossCustomer.length} ชุด`);
console.log(APPLY ? "โหมด: เขียนจริง\n" : "โหมด: ทดลอง — ใส่ --apply เพื่อเขียน\n");

let merged = 0;
for (const { code, group, keep: chosen } of groups) {
  const sorted = [...group].sort((a, b) => total(b.id) - total(a.id));
  const keep = chosen ?? sorted[0];
  const drop = sorted.filter((g) => g.id !== keep.id);
  console.log(`${code}  ${coName.get(keep.company_id) ?? "—"}`);
  console.log(`   เก็บ: ${keep.name.slice(0, 50)}  ${JSON.stringify(holdings(keep.id))}`);

  for (const d of drop) {
    console.log(`   รวม: ${d.name.slice(0, 50)}  ${JSON.stringify(holdings(d.id))}`);
    if (!APPLY) continue;

    let failed = false;
    for (const [table, rows] of LINKED) {
      const ids = rows.filter((r) => r.site_id === d.id).map((r) => r.id);
      if (!ids.length) continue;
      const { error } = await sb
        .from(table).update({ site_id: keep.id }).in("id", ids).eq("org_id", ORG.id);
      if (error) {
        failed = true;
        console.log(`      ✗ ย้าย ${table} — ${error.message}`);
      } else {
        rows.filter((r) => r.site_id === d.id).forEach((r) => (r.site_id = keep.id));
        console.log(`      ✓ ย้าย ${table} ${ids.length} แถว`);
      }
    }
    if (failed) {
      console.log("      – ไม่ลบ เพราะย้ายข้อมูลไม่ครบ");
      continue;
    }

    // Anything the duplicate knew and the survivor did not goes with it.
    const patch = {};
    for (const f of ["address", "map_url", "contact_id"]) if (!keep[f] && d[f]) patch[f] = d[f];
    const carried = [
      d.name !== keep.name ? `ชื่ออีกแบบจากระบบเก่า: ${d.name}` : "",
      d.address && keep.address && d.address !== keep.address ? `ที่อยู่จากไซต์ซ้ำ: ${d.address}` : "",
    ].filter(Boolean);
    if (carried.length) patch.notes = [keep.notes, ...carried].filter(Boolean).join("\n");

    if (Object.keys(patch).length) {
      const { error } = await sb.from("sites").update(patch).eq("id", keep.id).eq("org_id", ORG.id);
      if (error) console.log(`      ✗ ย้ายข้อมูลที่ขาด — ${error.message}`);
      else {
        Object.assign(keep, patch);
        console.log(`      ✓ เก็บข้อมูลจากไซต์ซ้ำไว้ (${Object.keys(patch).join(", ")})`);
      }
    }

    const { error } = await sb.from("sites").delete().eq("id", d.id).eq("org_id", ORG.id);
    if (error) console.log(`      ✗ ลบไม่ได้ — ${error.message}`);
    else merged++;
  }
}

if (crossCustomer.length) {
  console.log(`\n⚠ เลขสถานีเดียวกันแต่คนละลูกค้า ${crossCustomer.length} ชุด — ไม่รวมให้ ต้องตัดสินว่าใครเป็นเจ้าของ`);
  crossCustomer.forEach(({ code, group }) => {
    console.log(`   ${code}`);
    group.forEach((g) =>
      console.log(`      ${g.name.slice(0, 44).padEnd(46)} ${(coName.get(g.company_id) ?? "—").slice(0, 40)}`)
    );
  });
}

console.log(
  APPLY ? `\n✓ รวมไซต์ซ้ำแล้ว ${merged}` : "\nยังไม่ได้เขียนอะไร — รันซ้ำด้วย --apply"
);
