/**
 * Bulk-loads a filled-in template from /import-templates into Supabase.
 *
 *   node scripts/import-xlsx.mjs <file.xlsx>            # dry run — writes nothing
 *   node scripts/import-xlsx.mjs <file.xlsx> --apply    # actually writes
 *   node scripts/import-xlsx.mjs <dir>                  # every .xlsx, in import order
 *
 * Which template a file is gets worked out from its header row, so the file
 * name does not matter. A dry run reports exactly what would happen to every
 * row; run it, read it, then re-run with --apply.
 *
 * Existing rows are UPDATED rather than duplicated. A blank cell means "leave
 * whatever is there alone" — it never blanks out a value that is already in
 * the database — so a partially filled sheet can top up existing records.
 *
 * Take a backup first:  node scripts/backup.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { readSheet, excelSerialToYmd } from "./xlsx-read.mjs";
import { SPECS, specForHeaders } from "./import-schema.mjs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const target = args.find((a) => !a.startsWith("--"));

if (!target) {
  console.error("ใช้: node scripts/import-xlsx.mjs <ไฟล์.xlsx | โฟลเดอร์> [--apply]");
  process.exit(1);
}

// ---------------------------------------------------------------------------
//  Connection
// ---------------------------------------------------------------------------

const env = Object.fromEntries(
  readFileSync("c:/CRM/.env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!URL_ || SVC.length < 40 || /your-|placeholder/i.test(SVC)) {
  console.error("ต้องมี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ที่ใช้ได้ใน .env.local");
  process.exit(1);
}
const sb = createClient(URL_, SVC, { auth: { persistSession: false } });

const { data: orgs, error: orgErr } = await sb.from("organizations").select("id, name");
if (orgErr || !orgs?.length) {
  console.error("อ่าน organizations ไม่ได้:", orgErr?.message ?? "ไม่มีข้อมูล");
  process.exit(1);
}
if (orgs.length > 1) {
  console.error(`มี organization ${orgs.length} รายการ — สคริปต์นี้รองรับแค่ 1 workspace`);
  process.exit(1);
}
const ORG = orgs[0];

// ---------------------------------------------------------------------------
//  Value helpers
// ---------------------------------------------------------------------------

const s = (v) => String(v ?? "").trim();
const blank = (v) => s(v) === "";
/** Loose key for matching human-typed text: collapse spaces, fold case. */
const norm = (v) => s(v).replace(/\s+/g, " ").toLowerCase();
/** Tax ids and phones get compared digits-only — punctuation varies by typist. */
const digits = (v) => s(v).replace(/\D/g, "");

function toYmd(v, label, errors) {
  if (blank(v)) return null;
  const raw = s(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw) return raw;
    errors.push(`${label}: ไม่ใช่วันที่ที่มีจริง (${raw})`);
    return null;
  }
  // Excel hands back a serial when the cell was left as a date-formatted number.
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const ymd = excelSerialToYmd(Number(raw));
    if (ymd) return ymd;
  }
  errors.push(`${label}: ต้องเป็นรูปแบบ YYYY-MM-DD (ได้ “${raw}”)`);
  return null;
}

function toInt(v, label, errors) {
  if (blank(v)) return null;
  const n = Number(s(v).replace(/,/g, ""));
  if (!Number.isFinite(n)) {
    errors.push(`${label}: ต้องเป็นตัวเลข (ได้ “${s(v)}”)`);
    return null;
  }
  return Math.round(n);
}

function toNum(v, label, errors) {
  if (blank(v)) return null;
  const n = Number(s(v).replace(/,/g, ""));
  if (!Number.isFinite(n)) {
    errors.push(`${label}: ต้องเป็นตัวเลข (ได้ “${s(v)}”)`);
    return null;
  }
  return n;
}

function enumVal(v, list, label, fallback, errors) {
  if (blank(v)) return fallback;
  const got = norm(v);
  const hit = list.find((x) => x.toLowerCase() === got);
  if (hit) return hit;
  errors.push(`${label}: ต้องเป็น ${list.join(" / ")} (ได้ “${s(v)}”)`);
  return fallback;
}

const addMonths = (ymd, months) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // Clamp for months that are too short (31 Jan + 1 month -> 28/29 Feb).
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
//  Lookup indexes — loaded once, kept current as rows are created
// ---------------------------------------------------------------------------

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

const db = {
  companies: await loadAll("companies", "id, name, customer_code, tax_id"),
  contacts: await loadAll("contacts", "id, first_name, last_name, phone, company_id"),
  sites: await loadAll("sites", "id, name, company_id"),
  technicians: await loadAll("technicians", "id, name"),
  asset_groups: await loadAll("asset_groups", "id, site_id, name"),
  equipment: await loadAll("equipment", "id, site_id, name, serial_number, project_number"),
  service_contracts: await loadAll("service_contracts", "id, title, company_id, site_id, start_date, frequency_per_year, duration_years"),
};

/** customer_code -> tax_id -> name, matching the order the templates document. */
function findCompany(row) {
  const code = s(row.customer_code);
  if (code) {
    const hit = db.companies.find((c) => norm(c.customer_code) === norm(code));
    if (hit) return { hit, by: "customer_code" };
    return { hit: null, by: "customer_code", miss: code };
  }
  const tax = digits(row.tax_id);
  if (tax) {
    const hit = db.companies.find((c) => digits(c.tax_id) === tax);
    if (hit) return { hit, by: "tax_id" };
    return { hit: null, by: "tax_id", miss: s(row.tax_id) };
  }
  const name = s(row.company_name);
  if (name) {
    const hit = db.companies.find((c) => norm(c.name) === norm(name));
    if (hit) return { hit, by: "company_name" };
    return { hit: null, by: "company_name", miss: name };
  }
  return { hit: null, by: null };
}

const fullName = (c) => norm([c.first_name, c.last_name].filter(Boolean).join(" "));

// ---------------------------------------------------------------------------
//  Per-template row handlers
//
//  Each returns { action, key, payload, errors, apply? }
//    action  "insert" | "update" | "skip"
//    apply   extra work to run after the row is written (contract visits)
// ---------------------------------------------------------------------------

const handlers = {
  "import-template-companies.xlsx": {
    table: "companies",
    label: "ลูกค้า",
    plan(row) {
      const errors = [];
      const name = s(row.name);
      if (!name) return { action: "skip", key: "—", errors: ["ไม่มี name"] };

      const code = s(row.customer_code);
      const tax = digits(row.tax_id);
      const existing =
        (code && db.companies.find((c) => norm(c.customer_code) === norm(code))) ||
        (tax && db.companies.find((c) => digits(c.tax_id) === tax)) ||
        db.companies.find((c) => norm(c.name) === norm(name)) ||
        null;

      const tags = blank(row.tags)
        ? null
        : [...new Set(s(row.tags).split(",").map((t) => t.trim()).filter(Boolean))];

      const payload = {
        name,
        customer_code: blank(row.customer_code) ? undefined : code,
        tax_id: blank(row.tax_id) ? undefined : s(row.tax_id),
        tags: tags ?? undefined,
        industry: blank(row.industry) ? undefined : s(row.industry),
        phone: blank(row.phone) ? undefined : s(row.phone),
        website: blank(row.website) ? undefined : s(row.website),
        address: blank(row.address) ? undefined : s(row.address),
        notes: blank(row.notes) ? undefined : s(row.notes),
      };

      return {
        action: existing ? "update" : "insert",
        id: existing?.id,
        key: name,
        note: existing ? `ตรงกับของเดิม (${code || s(row.tax_id) || name})` : "",
        payload,
        errors,
      };
    },
    remember(saved) {
      const i = db.companies.findIndex((c) => c.id === saved.id);
      const rec = { id: saved.id, name: saved.name, customer_code: saved.customer_code, tax_id: saved.tax_id };
      if (i >= 0) db.companies[i] = rec; else db.companies.push(rec);
    },
  },

  "import-template-contacts.xlsx": {
    table: "contacts",
    label: "ผู้ติดต่อ",
    plan(row) {
      const errors = [];
      const first = s(row.first_name);
      if (!first) return { action: "skip", key: "—", errors: ["ไม่มี first_name"] };

      const co = findCompany(row);
      if (co.miss) errors.push(`หาบริษัทจาก ${co.by} “${co.miss}” ไม่เจอ`);
      const last = s(row.last_name);
      const who = norm([first, last].filter(Boolean).join(" "));

      const existing = co.hit
        ? db.contacts.find((c) => c.company_id === co.hit.id && fullName(c) === who)
        : db.contacts.find(
            (c) => fullName(c) === who && digits(c.phone) && digits(c.phone) === digits(row.phone)
          );

      const payload = {
        first_name: first,
        last_name: blank(row.last_name) ? undefined : last,
        email: blank(row.email) ? undefined : s(row.email),
        phone: blank(row.phone) ? undefined : s(row.phone),
        title: blank(row.title) ? undefined : s(row.title),
        company_id: co.hit ? co.hit.id : undefined,
        notes: blank(row.notes) ? undefined : s(row.notes),
      };

      return {
        action: errors.length ? "skip" : existing ? "update" : "insert",
        id: existing?.id,
        key: [first, last].filter(Boolean).join(" "),
        note: co.hit ? `บริษัท: ${co.hit.name} (จาก ${co.by})` : "ไม่ได้ผูกบริษัท",
        payload,
        errors,
      };
    },
    remember(saved) {
      const i = db.contacts.findIndex((c) => c.id === saved.id);
      const rec = {
        id: saved.id, first_name: saved.first_name, last_name: saved.last_name,
        phone: saved.phone, company_id: saved.company_id,
      };
      if (i >= 0) db.contacts[i] = rec; else db.contacts.push(rec);
    },
  },

  "import-template-sites.xlsx": {
    table: "sites",
    label: "ไซต์งาน",
    plan(row) {
      const errors = [];
      const name = s(row.name);
      if (!name) return { action: "skip", key: "—", errors: ["ไม่มี name"] };

      const co = findCompany(row);
      if (co.miss) errors.push(`หาบริษัทจาก ${co.by} “${co.miss}” ไม่เจอ`);

      let contactId;
      if (!blank(row.contact_name)) {
        const who = norm(row.contact_name);
        const pool = co.hit ? db.contacts.filter((c) => c.company_id === co.hit.id) : db.contacts;
        const hit =
          pool.find((c) => fullName(c) === who) ??
          (digits(row.contact_phone)
            ? pool.find((c) => digits(c.phone) === digits(row.contact_phone))
            : null);
        if (hit) contactId = hit.id;
        else errors.push(`หาผู้ติดต่อ “${s(row.contact_name)}” ไม่เจอ`);
      }

      const existing = co.hit
        ? db.sites.find((x) => x.company_id === co.hit.id && norm(x.name) === norm(name))
        : db.sites.find((x) => norm(x.name) === norm(name));

      const payload = {
        name,
        company_id: co.hit ? co.hit.id : undefined,
        address: blank(row.address) ? undefined : s(row.address),
        map_url: blank(row.map_url) ? undefined : s(row.map_url),
        contact_id: contactId,
        notes: blank(row.notes) ? undefined : s(row.notes),
      };

      return {
        action: errors.length ? "skip" : existing ? "update" : "insert",
        id: existing?.id,
        key: name,
        note: co.hit ? `ลูกค้า: ${co.hit.name}` : "ไม่ได้ผูกลูกค้า",
        payload,
        errors,
      };
    },
    remember(saved) {
      const i = db.sites.findIndex((x) => x.id === saved.id);
      const rec = { id: saved.id, name: saved.name, company_id: saved.company_id };
      if (i >= 0) db.sites[i] = rec; else db.sites.push(rec);
    },
  },

  "import-template-assets.xlsx": {
    table: "equipment",
    label: "Asset",
    plan(row) {
      const errors = [];
      const name = s(row.name);
      const siteName = s(row.site_name);
      if (!name) return { action: "skip", key: "—", errors: ["ไม่มี name"] };
      if (!siteName) return { action: "skip", key: name, errors: ["ไม่มี site_name"] };

      const site = db.sites.find((x) => norm(x.name) === norm(siteName));
      if (!site) return { action: "skip", key: name, errors: [`หาไซต์ “${siteName}” ไม่เจอ`] };

      const spec = SPECS.find((x) => x.file === "import-template-assets.xlsx");
      const listOf = (k) => spec.cols.find((c) => c.key === k).list;
      const assetType = enumVal(row.asset_type, listOf("asset_type"), "asset_type", "object", errors);
      const category = enumVal(row.category, listOf("category"), "category", "other", errors);
      const status = enumVal(row.status, listOf("status"), "status", "operational", errors);
      const isProject = assetType === "project";

      // The app clears whichever identifier does not apply; mirror that here.
      const serial = isProject ? null : blank(row.serial_number) ? undefined : s(row.serial_number);
      const project = isProject ? (blank(row.project_number) ? undefined : s(row.project_number)) : null;

      let groupId;
      let groupNote = "";
      if (!blank(row.group_name)) {
        const g = db.asset_groups.find(
          (x) => x.site_id === site.id && norm(x.name) === norm(row.group_name)
        );
        if (g) groupId = g.id;
        else groupNote = `จะสร้างกลุ่ม “${s(row.group_name)}”`;
      }

      const inSite = db.equipment.filter((e) => e.site_id === site.id);
      const existing =
        (!isProject && !blank(row.serial_number)
          ? inSite.find((e) => norm(e.serial_number) === norm(row.serial_number))
          : null) ||
        (isProject && !blank(row.project_number)
          ? inSite.find((e) => norm(e.project_number) === norm(row.project_number))
          : null) ||
        inSite.find((e) => norm(e.name) === norm(name)) ||
        null;

      const payload = {
        site_id: site.id,
        name,
        asset_type: assetType,
        category,
        status,
        brand: blank(row.brand) ? undefined : s(row.brand),
        model: blank(row.model) ? undefined : s(row.model),
        serial_number: serial,
        project_number: project,
        install_date: toYmd(row.install_date, "install_date", errors) ?? undefined,
        warranty_start: toYmd(row.warranty_start, "warranty_start", errors) ?? undefined,
        warranty_months: toInt(row.warranty_months, "warranty_months", errors) ?? undefined,
        notes: blank(row.notes) ? undefined : s(row.notes),
      };

      return {
        action: errors.length ? "skip" : existing ? "update" : "insert",
        id: existing?.id,
        key: name,
        note: [`ไซต์: ${site.name}`, groupNote].filter(Boolean).join(" · "),
        payload,
        errors,
        // Groups are created on demand so a sheet can introduce new ones.
        async before() {
          if (groupId || blank(row.group_name)) return { group_id: groupId };
          const { data, error } = await sb
            .from("asset_groups")
            .insert({ org_id: ORG.id, site_id: site.id, name: s(row.group_name) })
            .select("id, site_id, name")
            .single();
          if (error) throw new Error(`สร้างกลุ่ม “${s(row.group_name)}” ไม่ได้: ${error.message}`);
          db.asset_groups.push(data);
          return { group_id: data.id };
        },
      };
    },
    remember(saved) {
      const i = db.equipment.findIndex((e) => e.id === saved.id);
      const rec = {
        id: saved.id, site_id: saved.site_id, name: saved.name,
        serial_number: saved.serial_number, project_number: saved.project_number,
      };
      if (i >= 0) db.equipment[i] = rec; else db.equipment.push(rec);
    },
  },

  "import-template-service-contracts.xlsx": {
    table: "service_contracts",
    label: "สัญญาบริการ",
    plan(row) {
      const errors = [];
      const title = s(row.title);
      if (!title) return { action: "skip", key: "—", errors: ["ไม่มี title"] };

      const co = findCompany(row);
      if (co.miss) errors.push(`หาบริษัทจาก ${co.by} “${co.miss}” ไม่เจอ`);

      let site = null;
      if (!blank(row.site_name)) {
        site = db.sites.find((x) => norm(x.name) === norm(row.site_name)) ?? null;
        if (!site) errors.push(`หาไซต์ “${s(row.site_name)}” ไม่เจอ`);
      }

      let techId;
      if (!blank(row.technician_name)) {
        const t = db.technicians.find((x) => norm(x.name) === norm(row.technician_name));
        if (t) techId = t.id;
        else errors.push(`หาช่าง “${s(row.technician_name)}” ไม่เจอ`);
      }

      const spec = SPECS.find((x) => x.file === "import-template-service-contracts.xlsx");
      const listOf = (k) => spec.cols.find((c) => c.key === k).list;
      const serviceType = enumVal(row.service_type, listOf("service_type"), "service_type", "panel_cleaning", errors);
      const status = enumVal(row.status, listOf("status"), "status", "active", errors);
      // The app silently drops an unknown board rather than failing the save.
      const board = blank(row.board_key)
        ? undefined
        : listOf("board_key").includes(norm(row.board_key)) ? norm(row.board_key) : null;

      const startDate = toYmd(row.start_date, "start_date", errors);
      if (!startDate && blank(row.start_date)) errors.push("ไม่มี start_date");

      const freq = toInt(row.frequency_per_year, "frequency_per_year", errors) ?? 2;
      const years = toNum(row.duration_years, "duration_years", errors) ?? 5;
      if (freq <= 0) errors.push("frequency_per_year ต้องมากกว่า 0");
      if (years <= 0) errors.push("duration_years ต้องมากกว่า 0");

      const existing =
        (site ? db.service_contracts.find((c) => c.site_id === site.id && norm(c.title) === norm(title)) : null) ||
        (co.hit ? db.service_contracts.find((c) => c.company_id === co.hit.id && norm(c.title) === norm(title)) : null) ||
        null;

      const payload = errors.length
        ? {}
        : {
            title,
            company_id: co.hit ? co.hit.id : undefined,
            site_id: site ? site.id : undefined,
            service_type: serviceType,
            status,
            start_date: startDate,
            frequency_per_year: freq,
            duration_years: years,
            end_date: addMonths(startDate, Math.round(years * 12)),
            technician_id: techId,
            board_key: board,
            notes: blank(row.notes) ? undefined : s(row.notes),
          };

      const total = Math.max(1, Math.round(freq * years));
      return {
        action: errors.length ? "skip" : existing ? "update" : "insert",
        id: existing?.id,
        key: title,
        note: [
          site ? `ไซต์: ${site.name}` : co.hit ? `ลูกค้า: ${co.hit.name}` : "ไม่ได้ผูกไซต์/ลูกค้า",
          errors.length ? "" : `${total} รอบ ถึง ${addMonths(startDate, Math.round(years * 12))}`,
        ].filter(Boolean).join(" · "),
        payload,
        errors,
        async after(id, wasInsert) {
          await syncVisits(id, startDate, freq, years, wasInsert, existing);
        },
      };
    },
    remember(saved) {
      const i = db.service_contracts.findIndex((c) => c.id === saved.id);
      const rec = {
        id: saved.id, title: saved.title, company_id: saved.company_id, site_id: saved.site_id,
        start_date: saved.start_date, frequency_per_year: saved.frequency_per_year,
        duration_years: saved.duration_years,
      };
      if (i >= 0) db.service_contracts[i] = rec; else db.service_contracts.push(rec);
    },
  },
};

/**
 * Builds the visit schedule. Mirrors saveContract in the app: visits already
 * acted on (done/skipped) keep their slot, pending ones are regenerated.
 */
async function syncVisits(contractId, startDate, freq, years, wasInsert, previous) {
  const total = Math.max(1, Math.round(freq * years));
  const interval = Math.max(1, Math.round(12 / freq));
  const wanted = Array.from({ length: total }, (_, i) => ({
    org_id: ORG.id,
    contract_id: contractId,
    seq: i + 1,
    due_date: addMonths(startDate, i * interval),
  }));

  if (wasInsert) {
    const { error } = await sb.from("service_visits").insert(wanted);
    if (error) throw new Error(`สร้างรอบเข้าบริการไม่ได้: ${error.message}`);
    return total;
  }

  const changed =
    previous?.start_date !== startDate ||
    Number(previous?.frequency_per_year) !== freq ||
    Number(previous?.duration_years) !== years;
  if (!changed) return 0;

  const { data: kept, error: keptErr } = await sb
    .from("service_visits").select("seq").eq("contract_id", contractId).neq("status", "pending");
  if (keptErr) throw new Error(`อ่านรอบเดิมไม่ได้: ${keptErr.message}`);
  const keptSeqs = new Set((kept ?? []).map((r) => r.seq));

  const { error: delErr } = await sb
    .from("service_visits").delete().eq("contract_id", contractId).eq("status", "pending");
  if (delErr) throw new Error(`ลบรอบเดิมไม่ได้: ${delErr.message}`);

  const fresh = wanted.filter((v) => !keptSeqs.has(v.seq));
  if (fresh.length) {
    const { error } = await sb.from("service_visits").insert(fresh);
    if (error) throw new Error(`สร้างรอบใหม่ไม่ได้: ${error.message}`);
  }
  return fresh.length;
}

// ---------------------------------------------------------------------------
//  Run one file
// ---------------------------------------------------------------------------

/** Drop keys whose value is undefined — those are the "leave alone" cells. */
const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** Counter for the placeholder ids a dry run hands to rows it only pretends to create. */
let dryRunSeq = 0;

async function importFile(path) {
  const sheet = readSheet(path);
  const header = sheet.rows[0] ?? [];
  const match = specForHeaders(header);
  if (!match) {
    console.log(`\n▶ ${basename(path)}`);
    console.log("   ✗ หัวคอลัมน์ไม่ตรงกับเทมเพลตไหนเลย — ข้ามไฟล์นี้");
    return { file: basename(path), insert: 0, update: 0, skip: 0, failed: 1 };
  }

  const { spec, missing } = match;
  const handler = handlers[spec.file];
  const keys = header.map((h) => s(h));
  const dataRows = sheet.rows.slice(1);

  console.log(`\n▶ ${basename(path)}  →  ${handler.label} (${handler.table})`);
  if (missing.length) console.log(`   ⚠ ไม่มีคอลัมน์: ${missing.join(", ")} — จะถือว่าเว้นว่าง`);

  const counts = { insert: 0, update: 0, skip: 0, failed: 0 };

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    const excelRow = i + 2;
    if (cells.every((c) => s(c) === "")) continue;

    const row = Object.fromEntries(keys.map((k, ci) => [k, cells[ci] ?? ""]));

    let plan;
    try {
      plan = handler.plan(row);
    } catch (e) {
      counts.failed++;
      console.log(`   ${String(excelRow).padStart(4)}  ✗ ${e.message}`);
      continue;
    }

    if (plan.action === "skip") {
      counts.skip++;
      console.log(`   ${String(excelRow).padStart(4)}  ⊘ ข้าม  ${plan.key} — ${plan.errors.join("; ")}`);
      continue;
    }

    const verb = plan.action === "insert" ? "เพิ่ม " : "อัปเดต";
    if (!APPLY) {
      counts[plan.action]++;
      // Pretend the insert happened so the files that depend on it — contacts
      // on companies, assets on sites — can be previewed properly too.
      if (plan.action === "insert") {
        dryRunSeq++;
        handler.remember({ id: `dry-${dryRunSeq}`, ...defined(plan.payload) });
      }
      console.log(`   ${String(excelRow).padStart(4)}  · ${verb} ${plan.key}${plan.note ? `  — ${plan.note}` : ""}`);
      continue;
    }

    try {
      const extra = plan.before ? await plan.before() : {};
      const payload = defined({ ...plan.payload, ...extra });

      let saved;
      if (plan.action === "insert") {
        const { data, error } = await sb
          .from(handler.table).insert({ org_id: ORG.id, ...payload }).select("*").single();
        if (error) throw new Error(error.message);
        saved = data;
      } else {
        const { data, error } = await sb
          .from(handler.table).update(payload).eq("id", plan.id).eq("org_id", ORG.id)
          .select("*").single();
        if (error) throw new Error(error.message);
        saved = data;
      }

      handler.remember(saved);
      if (plan.after) await plan.after(saved.id, plan.action === "insert");

      counts[plan.action]++;
      console.log(`   ${String(excelRow).padStart(4)}  ✓ ${verb} ${plan.key}${plan.note ? `  — ${plan.note}` : ""}`);
    } catch (e) {
      counts.failed++;
      console.log(`   ${String(excelRow).padStart(4)}  ✗ ${plan.key} — ${e.message}`);
    }
  }

  console.log(
    `   สรุป: เพิ่ม ${counts.insert} · อัปเดต ${counts.update} · ข้าม ${counts.skip}` +
    (counts.failed ? ` · ผิดพลาด ${counts.failed}` : "")
  );
  return { file: basename(path), ...counts };
}

// ---------------------------------------------------------------------------

const files = statSync(target).isDirectory()
  ? readdirSync(target)
      .filter((f) => f.toLowerCase().endsWith(".xlsx") && !f.startsWith("~$"))
      .map((f) => join(target, f))
  : [target];

// Parents before children, whatever order the directory listing gave us.
const rank = (p) => {
  try {
    const m = specForHeaders(readSheet(p).rows[0] ?? []);
    return m ? SPECS.indexOf(m.spec) : 99;
  } catch {
    return 99;
  }
};
files.sort((a, b) => rank(a) - rank(b));

console.log(`workspace : ${ORG.name}`);
console.log(`ปลายทาง   : ${URL_}`);
console.log(`ไฟล์      : ${files.length}`);
console.log(APPLY ? "โหมด      : เขียนจริง" : "โหมด      : ทดลอง (dry run) — ยังไม่เขียนอะไร ใส่ --apply เพื่อเขียนจริง");

const totals = { insert: 0, update: 0, skip: 0, failed: 0 };
for (const f of files) {
  const r = await importFile(f);
  for (const k of Object.keys(totals)) totals[k] += r[k];
}

console.log(
  `\nรวมทุกไฟล์: เพิ่ม ${totals.insert} · อัปเดต ${totals.update} · ข้าม ${totals.skip}` +
  (totals.failed ? ` · ผิดพลาด ${totals.failed}` : "")
);
if (!APPLY) console.log("ยังไม่ได้เขียนอะไรลงฐานข้อมูล — ตรวจรายการข้างบนแล้วรันซ้ำด้วย --apply");
process.exit(totals.failed ? 1 : 0);
