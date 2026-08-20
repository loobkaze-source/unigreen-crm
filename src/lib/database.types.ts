/**
 * Hand-written types mirroring supabase/migrations/0001_init.sql.
 * Kept intentionally small and readable; regenerate with the Supabase CLI
 * (`supabase gen types typescript`) if you prefer fully generated types.
 */

export type MemberRole = "owner" | "admin" | "member";
export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "unqualified"
  | "converted";
export type ActivityType = "note" | "call" | "meeting" | "email" | "task";

type Timestamps = {
  created_at: string;
};
type Mutable = Timestamps & {
  updated_at: string;
};

export interface Profile extends Timestamps {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export interface Organization extends Timestamps {
  id: string;
  name: string;
  created_by: string;
}

export interface OrganizationMember extends Timestamps {
  id: string;
  org_id: string;
  user_id: string;
  role: MemberRole;
}

export interface Stage extends Timestamps {
  id: string;
  org_id: string;
  name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  /** Department board this stage belongs to (see lib/departments.ts). */
  board_key: string;
  /** Permanent stage (Won / Missed) — cannot be renamed, reordered, deleted. */
  locked: boolean;
}

export interface Company extends Mutable {
  id: string;
  org_id: string;
  customer_code: string | null;
  tax_id: string | null;
  tags: string[];
  name: string;
  industry: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  owner_id: string | null;
}

export interface Contact extends Mutable {
  id: string;
  org_id: string;
  company_id: string | null;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  notes: string | null;
  owner_id: string | null;
}

export interface Lead extends Mutable {
  id: string;
  org_id: string;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: LeadStatus;
  value: number | null;
  notes: string | null;
  owner_id: string | null;
  converted_contact_id: string | null;
  converted_company_id: string | null;
  converted_deal_id: string | null;
  converted_at: string | null;
}

export interface Deal extends Mutable {
  id: string;
  org_id: string;
  title: string;
  value: number;
  currency: string;
  stage_id: string;
  department: string;
  company_id: string | null;
  contact_id: string | null;
  expected_close_date: string | null;
  notes: string | null;
  owner_id: string | null;
}

export interface Activity extends Mutable {
  id: string;
  org_id: string;
  type: ActivityType;
  subject: string;
  body: string | null;
  due_date: string | null;
  done: boolean;
  done_at: string | null;
  owner_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  deal_id: string | null;
  lead_id: string | null;
}

/**
 * The system a job is on — ATG, VRU, a dispenser. Free text since 0043, for the
 * same reason equipment.category is: a station's machines outgrow any list
 * fixed in a migration. The app's own list is WO_TYPES.
 */
export type WorkOrderType = string;
export type WorkOrderStatus =
  | "new"
  | "scheduled"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "cancelled";
export type WorkOrderPriority = "low" | "normal" | "high" | "urgent";

export interface Technician extends Mutable {
  id: string;
  org_id: string;
  user_id: string | null;
  name: string;
  nickname: string | null;
  email: string | null;
  phone: string | null;
  skill: string | null;
  skills: string[];
  /** Safety certifications ("ใบเซอร์") — e.g. จป.หัวหน้างาน, จป.ที่สูง. */
  certifications: string[];
  active: boolean;
}

/** งานซ่อมแก้ไข (CM) หรือ บำรุงรักษาเชิงป้องกัน (PM). */
export type WorkOrderJobClass = "CM" | "PM";
/** อยู่ในประกัน · ในสัญญาบำรุงรักษา · หรือเก็บเงินลูกค้า (ข้อ 6–8 ในใบรายงานการซ่อม). */
export type WorkOrderBilling = "warranty" | "contract" | "paid";

/**
 * ข้อ 9–14 ในใบรายงานการซ่อม — what was actually done on the visit, and a
 * visit is regularly several at once. Separate from `type`, which is the one
 * word the dispatcher files the job under before anyone has been.
 */
export type WorkKind =
  | "installation"
  | "repair"
  | "cmn"
  | "calibrate"
  | "relocate"
  | "pm";

export interface WorkOrder extends Mutable {
  id: string;
  org_id: string;
  number: number | null;
  title: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  job_class: WorkOrderJobClass | null;
  billing: WorkOrderBilling | null;
  asset_id: string | null;
  board_key: string | null;
  site_id: string | null;
  case_id: string | null;
  /** The service contract this job is done under, when it answers one. */
  contract_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  technician_id: string | null;
  site_address: string | null;
  site_map_url: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  description: string | null;
  completed_at: string | null;
  owner_id: string | null;
  /** When the assigned technician acknowledged the job ("รับงาน"). */
  accepted_at: string | null;
  accepted_by: string | null;
  /** The technician's own note from site (dispatcher's brief is `description`). */
  technician_remark: string | null;
  /**
   * How the job was closed. One visit regularly answers more than one fault and
   * applies more than one fix, so the three are lists; the remedy is prose.
   */
  fault_codes: string[];
  repair_codes: string[];
  causes: string[];
  remedy: string | null;
  /** The customer's reference for the visit, and our report book number. */
  customer_job_no: string | null;
  report_no: string | null;
  /** When the work was actually done — `scheduled_*` is when it was booked. */
  started_at: string | null;
  finished_at: string | null;
  /** Odometer out and back; the difference is the distance claimed. */
  mileage_start: number | null;
  mileage_end: number | null;
  work_kinds: WorkKind[];
  /** The customer's signature, in the wo-photos bucket. Null until signed. */
  signature_path: string | null;
  signed_by: string | null;
  signed_at: string | null;
}

export interface WorkOrderItem extends Timestamps {
  id: string;
  org_id: string;
  work_order_id: string;
  label: string;
  done: boolean;
  position: number;
}

export interface WorkOrderPhoto extends Timestamps {
  id: string;
  /** Where it sits in the story the photos tell; lowest first. */
  position: number;
  org_id: string;
  work_order_id: string;
  path: string;
  caption: string | null;
}

/**
 * What kind of machine this is. Six values were an enum until the service side
 * brought 68 kinds of petrol-station equipment; the names below are the ones
 * the app knows a Thai label for, and any other string is shown as it stands.
 */
export type KnownEquipmentCategory =
  | "solar_panel"
  | "inverter"
  | "ev_charger"
  | "battery"
  | "meter"
  | "other";

export type EquipmentCategory = KnownEquipmentCategory | (string & {});
export type ServiceType =
  | "panel_cleaning"
  | "filter_cleaning"
  | "inspection"
  | "maintenance"
  | "other";
export type VisitStatus = "pending" | "done" | "skipped";
export type ContractStatus = "active" | "completed" | "cancelled";
export type WarrantyKind = "project" | "equipment";
export type WarrantyStatus = "active" | "expired" | "void";

export interface Site extends Mutable {
  id: string;
  org_id: string;
  company_id: string | null;
  name: string;
  address: string | null;
  map_url: string | null;
  contact_id: string | null;
  notes: string | null;
}

/** วัตถุ (identified by serial) หรือ โครงการ (identified by project number). */
export type AssetType = "object" | "project";

export interface AssetGroup extends Mutable {
  id: string;
  org_id: string;
  site_id: string;
  name: string;
}

export interface Equipment extends Mutable {
  id: string;
  org_id: string;
  code: number | null;
  /** เลขครุภัณฑ์ / QR code printed on the machine — unlike `code`, ours to read, not to issue. */
  asset_tag: string | null;
  site_id: string | null;
  group_id: string | null;
  name: string;
  asset_type: AssetType;
  category: EquipmentCategory;
  /** สถานะการใช้งาน: operational / degraded / down / retired (see lib/asset-status). */
  status: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  project_number: string | null;
  warranty_months: number | null;
  warranty_start: string | null;
  install_date: string | null;
  notes: string | null;
}

export interface ContactCompany extends Timestamps {
  id: string;
  org_id: string;
  contact_id: string;
  company_id: string;
  role: string | null;
}

export interface ServiceContract extends Mutable {
  id: string;
  org_id: string;
  /** UNG-2026-0001 — department, the year it started, and which one it was. */
  contract_no: string | null;
  company_id: string | null;
  site_id: string | null;
  title: string;
  service_type: ServiceType;
  start_date: string;
  frequency_per_year: number;
  duration_years: number;
  end_date: string | null;
  technician_id: string | null;
  board_key: string | null;
  status: ContractStatus;
  notes: string | null;
}

export interface ServiceVisit extends Timestamps {
  id: string;
  org_id: string;
  contract_id: string;
  seq: number;
  due_date: string;
  status: VisitStatus;
  completed_at: string | null;
  work_order_id: string | null;
  notes: string | null;
}

export interface Warranty extends Mutable {
  id: string;
  org_id: string;
  kind: WarrantyKind;
  company_id: string | null;
  site_id: string | null;
  equipment_id: string | null;
  title: string;
  serial_number: string | null;
  provider: string | null;
  start_date: string | null;
  end_date: string | null;
  terms: string | null;
  status: WarrantyStatus;
}

export type CaseStatus = "open" | "in_progress" | "closed";

export interface Case extends Mutable {
  id: string;
  org_id: string;
  number: number | null;
  /** MRD-0826-00001 — department, month/year, and a serial that restarts each month. */
  code: string | null;
  dept_code: string | null;
  subject: string;
  status: CaseStatus;
  case_type: string | null;
  case_from: string | null;
  /** The customer's own work-order number for this fault, when they quote one. */
  customer_wo_ref: string | null;
  note: string | null;
  action: string | null;
  employee: string | null;
  team: string | null;
  company_id: string | null;
  contact_id: string | null;
  site_id: string | null;
  supporter_id: string | null;
  equipment_id: string | null;
  case_date: string | null;
  source: string | null;
  owner_id: string | null;
}

export interface CaseAttachment {
  id: string;
  org_id: string;
  case_id: string;
  path: string;
  name: string | null;
  mime: string | null;
  created_at: string;
}

/** A case can affect many assets; each link carries the reported condition. */
export interface CaseAsset {
  id: string;
  org_id: string;
  case_id: string;
  equipment_id: string;
  condition: "operational" | "degraded" | "down" | null;
  created_at: string;
}

export interface Product extends Mutable {
  id: string;
  org_id: string;
  sku: string | null;
  name: string;
  description: string | null;
  category: string | null;
  barcode: string | null;
  cost: number | null;
  price: number | null;
  unit: string | null;
  quantity: number | null;
  active: boolean;
  source: string | null;
}

/** Helper to derive Insert/Update shapes: generated columns are optional. */
type Insertable<T, Optional extends keyof T> = Omit<T, Optional> &
  Partial<Pick<T, Optional>>;

type GenCols = "id" | "created_at" | "updated_at";

type TableDef<Row, Optional extends string> = {
  Row: Row;
  Insert: Insertable<Row, Extract<Optional, keyof Row>>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: TableDef<Profile, "created_at" | "avatar_url" | "full_name" | "email">;
      organizations: TableDef<Organization, GenCols | "created_by">;
      organization_members: TableDef<OrganizationMember, GenCols | "role">;
      stages: TableDef<Stage, GenCols | "position" | "is_won" | "is_lost">;
      companies: TableDef<Company, GenCols | "owner_id">;
      contacts: TableDef<Contact, GenCols | "owner_id">;
      leads: TableDef<Lead, GenCols | "owner_id" | "status">;
      deals: TableDef<Deal, GenCols | "owner_id" | "value" | "currency">;
      activities: TableDef<Activity, GenCols | "owner_id" | "done" | "type">;
    };
    Views: Record<string, never>;
    Functions: {
      is_org_member: { Args: { _org_id: string }; Returns: boolean };
      is_org_admin: { Args: { _org_id: string }; Returns: boolean };
      shares_org_with: { Args: { _user: string }; Returns: boolean };
      convert_lead: { Args: { p_lead_id: string }; Returns: string };
    };
    Enums: {
      member_role: MemberRole;
      lead_status: LeadStatus;
      activity_type: ActivityType;
    };
    CompositeTypes: Record<string, never>;
  };
}
