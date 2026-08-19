/**
 * Renames a customer to a confirmed name, merging into the existing record when
 * the CRM already holds that company under it.
 *
 *   node scripts/rename-companies.mjs
 *   node scripts/rename-companies.mjs --apply
 *
 * Several customers came across filed under an English name. Renaming alone is
 * not always enough: Tatsuno was already in the CRM under its Thai name from a
 * different source, so the two have to become one — sites and contacts move to
 * the record that keeps its customer_code and tax id, and the emptied duplicate
 * goes. Where there is no counterpart, it is a plain rename that keeps the
 * record's own history.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

/** from (as stored today) -> the confirmed name */
const RENAMES = [
  ["TATSUNO (THAILAND) CO.,LTD.", "บริษัท ทัทซูโน่ (ประเทศไทย) จำกัด"],
  ["TOYO-THAI CORPORATION PUBLIC COMPANY LIMITED", "บริษัท ทีทีซีแอล จำกัด (มหาชน)"],
  ["PTT Global Chemical Public Company Limited", "บริษัท พีทีที โกลบอล เคมิคอล จำกัด (มหาชน)"],
];

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
const foldSaraAm = (v) => v.replace(/ํา/g, "ำ").replace(/ໍາ/g, "ຳ");
const norm = (v) => foldSaraAm(s(v).replace(/\s+/g, " ").toLowerCase());

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

const companies = await loadAll("companies", "id, name, customer_code, tax_id");
const sites = await loadAll("sites", "id, company_id");
const contacts = await loadAll("contacts", "id, company_id");
const contracts = await loadAll("service_contracts", "id, company_id");

const held = (id) => ({
  sites: sites.filter((x) => x.company_id === id).length,
  contacts: contacts.filter((x) => x.company_id === id).length,
  contracts: contracts.filter((x) => x.company_id === id).length,
});

console.log(APPLY ? "โหมด: เขียนจริง\n" : "โหมด: ทดลอง — ใส่ --apply เพื่อเขียน\n");

for (const [from, to] of RENAMES) {
  const src = companies.find((c) => norm(c.name) === norm(from));
  if (!src) {
    console.log(`— ไม่พบ “${from}” (อาจแก้ไปแล้ว)`);
    continue;
  }
  const dst = companies.find((c) => c.id !== src.id && norm(c.name) === norm(to));
  const h = held(src.id);

  if (!dst) {
    console.log(`เปลี่ยนชื่อ: ${src.name}\n         → ${to}   (ไซต์ ${h.sites} · ผู้ติดต่อ ${h.contacts})`);
    if (!APPLY) continue;
    const { error } = await sb.from("companies").update({ name: to }).eq("id", src.id).eq("org_id", ORG.id);
    console.log(error ? `   ✗ ${error.message}` : "   ✓ แก้แล้ว");
    continue;
  }

  // The CRM already knows this company — fold the English record into it.
  const d = held(dst.id);
  console.log(
    `รวมระเบียน: ${src.name}  (ไซต์ ${h.sites} · ผู้ติดต่อ ${h.contacts})\n` +
    `         → ${dst.name}  (ไซต์ ${d.sites} · ผู้ติดต่อ ${d.contacts} · code=${dst.customer_code ?? "—"})`
  );
  if (!APPLY) continue;

  for (const [table, rows] of [["sites", sites], ["contacts", contacts], ["service_contracts", contracts]]) {
    const ids = rows.filter((x) => x.company_id === src.id).map((x) => x.id);
    if (!ids.length) continue;
    const { error } = await sb
      .from(table).update({ company_id: dst.id }).in("id", ids).eq("org_id", ORG.id);
    if (error) console.log(`   ✗ ย้าย ${table} ไม่ได้ — ${error.message}`);
    else console.log(`   ✓ ย้าย ${table} ${ids.length} แถว`);
  }
  const { error } = await sb.from("companies").delete().eq("id", src.id).eq("org_id", ORG.id);
  console.log(error ? `   ✗ ลบระเบียนซ้ำไม่ได้ — ${error.message}` : "   ✓ ลบระเบียนซ้ำแล้ว");
}

if (!APPLY) console.log("\nยังไม่ได้เขียนอะไร — รันซ้ำด้วย --apply");
