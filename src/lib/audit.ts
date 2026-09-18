import type { SessionContext } from "@/lib/data";

/**
 * Reading the audit log back as something a person would recognise.
 *
 * The trigger writes column names and raw values — `company_id` and a uuid.
 * This turns them into "ลูกค้า: บริษัท ก → บริษัท ข": the columns get Thai
 * labels, the foreign keys get looked up, and the person who did it gets a
 * name. All of it is display; the log itself is never touched.
 */

export type AuditEntry = {
  id: number;
  table: string;
  rowId: string;
  action: "insert" | "update" | "delete";
  changedAt: string;
  by: string;
  /** One line per column, already in words. */
  changes: { field: string; label: string; from: string | null; to: string | null }[];
  /** For an insert or delete: what the record was called. */
  summary: string;
};

export const TABLE_LABELS: Record<string, string> = {
  companies: "ลูกค้า",
  contacts: "ผู้ติดต่อ",
  sites: "ไซต์งาน",
  equipment: "Asset",
  work_orders: "ใบงาน",
  cases: "เคส",
  service_contracts: "สัญญาบริการ",
  warranties: "การรับประกัน",
  technicians: "ช่าง",
};

/** Thai for the columns people change. Anything else shows its own name. */
const FIELD_LABELS: Record<string, string> = {
  name: "ชื่อ",
  title: "ชื่อ",
  subject: "หัวข้อ",
  first_name: "ชื่อ",
  last_name: "นามสกุล",
  nickname: "ชื่อเล่น",
  email: "อีเมล",
  phone: "โทรศัพท์",
  address: "ที่อยู่",
  map_url: "ลิงก์แผนที่",
  notes: "หมายเหตุ",
  description: "รายละเอียด",
  status: "สถานะ",
  priority: "ความสำคัญ",
  type: "ประเภท",
  category: "ชนิดเครื่อง",
  kind: "ชนิด",
  brand: "ยี่ห้อ",
  model: "รุ่น",
  serial_number: "Serial",
  asset_tag: "รหัส Asset",
  code: "รหัส",
  tax_id: "เลขทะเบียนนิติบุคคล",
  industry: "ประเภทธุรกิจ",
  website: "เว็บไซต์",
  company_id: "ลูกค้า",
  site_id: "ไซต์งาน",
  contact_id: "ผู้ติดต่อ",
  technician_id: "ช่าง",
  owner_id: "ผู้รับผิดชอบ",
  supporter_id: "Technical Supporter",
  case_id: "เคส",
  contract_id: "สัญญา",
  equipment_id: "Asset",
  group_id: "กลุ่ม",
  board_key: "บอร์ด",
  contract_no: "เลขที่สัญญา",
  report_no: "เลขที่รายงาน",
  number: "เลขที่",
  case_code: "รหัสเคส",
  customer_wo_ref: "WO ref. ลูกค้า",
  customer_job_no: "JOB NO. ลูกค้า",
  job_class: "ลักษณะงาน",
  billing: "การเรียกเก็บ",
  scheduled_start: "นัดหมาย",
  scheduled_end: "นัดหมายถึง",
  started_at: "เริ่มงาน",
  finished_at: "จบงาน",
  completed_at: "เสร็จเมื่อ",
  accepted_at: "รับงานเมื่อ",
  start_date: "วันที่เริ่ม",
  end_date: "วันที่สิ้นสุด",
  first_visit_date: "เข้าบริการครั้งแรก",
  install_date: "วันติดตั้ง",
  warranty_start: "เริ่มประกัน",
  warranty_months: "ประกัน (เดือน)",
  frequency_per_year: "ครั้ง/ปี",
  duration_years: "ระยะเวลา (ปี)",
  service_type: "ประเภทบริการ",
  active: "ใช้งาน",
  skills: "ทักษะ",
  certifications: "ใบเซอร์",
  tags: "แท็ก",
  fault_codes: "รหัสอาการเสีย",
  repair_codes: "รหัสซ่อม",
  causes: "สาเหตุ",
  remedy: "การแก้ไข",
  technician_remark: "หมายเหตุช่าง",
  odometer_out: "เลขไมล์ออก",
  odometer_back: "เลขไมล์กลับ",
  signature_path: "ลายเซ็น",
  signed_by: "ผู้เซ็น",
  signed_at: "เซ็นเมื่อ",
  project_number: "เลขโครงการ",
  provider: "ผู้ให้ประกัน",
  terms: "เงื่อนไข",
  user_id: "บัญชีผู้ใช้",
};

/** Columns that hold a row from another table, and which table. */
const FOREIGN: Record<string, "companies" | "sites" | "contacts" | "technicians" | "equipment" | "service_contracts" | "cases"> = {
  company_id: "companies",
  site_id: "sites",
  contact_id: "contacts",
  technician_id: "technicians",
  equipment_id: "equipment",
  contract_id: "service_contracts",
  case_id: "cases",
};

/** Bookkeeping the reader did not change and does not need to see. */
const HIDDEN = new Set(["id", "org_id", "created_at", "updated_at", "position"]);

const fmtValue = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v ? "ใช่" : "ไม่";
  if (Array.isArray(v)) return v.length ? v.map(String).join(", ") : null;
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  // Timestamps come back ISO; show the day and the local time.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    const d = new Date(s);
    return d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" });
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}-${m}-${y}`;
  }
  return s;
};

type Db = SessionContext["supabase"];
type Raw = {
  id: number;
  table_name: string;
  row_id: string;
  action: "insert" | "update" | "delete";
  changed_at: string;
  changed_by: string | null;
  changed_fields: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

/**
 * Fetch and translate. Either one record's history (table + rowId) or the
 * org's most recent changes, optionally narrowed to one table.
 */
export async function loadAudit(
  supabase: Db,
  orgId: string,
  opts: { table?: string; rowId?: string; limit?: number }
): Promise<AuditEntry[]> {
  let q = supabase
    .from("audit_log")
    .select("id, table_name, row_id, action, changed_at, changed_by, changed_fields, before, after")
    .eq("org_id", orgId)
    .order("changed_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.table) q = q.eq("table_name", opts.table);
  if (opts.rowId) q = q.eq("row_id", opts.rowId);
  const { data } = await q;
  const rows = (data ?? []) as Raw[];
  if (!rows.length) return [];

  // Everyone who appears, and every foreign row that appears, in one lookup
  // per table rather than one per line.
  const actorIds = [...new Set(rows.map((r) => r.changed_by).filter(Boolean))] as string[];
  const refs = new Map<string, Set<string>>();
  for (const r of rows) {
    for (const src of [r.before, r.after]) {
      if (!src) continue;
      for (const [k, v] of Object.entries(src)) {
        const t = FOREIGN[k];
        if (t && typeof v === "string" && v) (refs.get(t) ?? refs.set(t, new Set()).get(t)!).add(v);
      }
    }
  }

  const [actors, ...refRows] = await Promise.all([
    actorIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", actorIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    ...[...refs.entries()].map(([t, ids]) => {
      const nameCol =
        t === "contacts" ? "first_name, last_name" : t === "service_contracts" ? "contract_no, title" : t === "cases" ? "case_code, title" : "name";
      // The select string is built at runtime, so the query parser cannot
      // type the rows; they are plain records and read as such below.
      return supabase
        .from(t)
        .select(`id, ${nameCol}`)
        .in("id", [...ids])
        .then((res) => ({ table: t, data: (res.data ?? []) as unknown as Record<string, unknown>[] }));
    }),
  ]);
  const actorName = new Map((actors.data ?? []).map((a) => [a.id, a.full_name ?? "—"]));
  const refName = new Map<string, string>();
  for (const { table, data } of refRows) {
    for (const row of data) {
      const id = row.id as string;
      const name =
        table === "contacts"
          ? [row.first_name, row.last_name].filter(Boolean).join(" ")
          : table === "service_contracts"
            ? [row.contract_no, row.title].filter(Boolean).join(" · ")
            : table === "cases"
              ? [row.case_code, row.title].filter(Boolean).join(" · ")
              : (row.name as string);
      refName.set(`${table}:${id}`, name || id);
    }
  }
  const show = (field: string, v: unknown): string | null => {
    const t = FOREIGN[field];
    if (t && typeof v === "string" && v) return refName.get(`${t}:${v}`) ?? v.slice(0, 8) + "…";
    return fmtValue(v);
  };

  return rows.map((r) => {
    const fields = r.changed_fields.filter((f) => !HIDDEN.has(f));
    const changes = fields.map((f) => ({
      field: f,
      label: FIELD_LABELS[f] ?? f,
      from: show(f, r.before?.[f]),
      to: show(f, r.after?.[f]),
    }));
    const rec = r.after ?? r.before ?? {};
    const summary =
      (rec.name as string) ||
      (rec.title as string) ||
      [rec.first_name, rec.last_name].filter(Boolean).join(" ") ||
      (rec.contract_no as string) ||
      (rec.case_code as string) ||
      (rec.report_no as string) ||
      "";
    return {
      id: r.id,
      table: r.table_name,
      rowId: r.row_id,
      action: r.action,
      changedAt: r.changed_at,
      by: r.changed_by ? actorName.get(r.changed_by) ?? "—" : "ระบบ",
      changes,
      summary,
    };
  });
}
