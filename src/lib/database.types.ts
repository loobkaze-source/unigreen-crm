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
}

export interface Company extends Mutable {
  id: string;
  org_id: string;
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

export type WorkOrderType =
  | "survey"
  | "installation"
  | "maintenance"
  | "repair"
  | "other";
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
  name: string;
  email: string | null;
  phone: string | null;
  skill: string | null;
  active: boolean;
}

export interface WorkOrder extends Mutable {
  id: string;
  org_id: string;
  number: number | null;
  title: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
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
  org_id: string;
  work_order_id: string;
  path: string;
  caption: string | null;
}

export type EquipmentCategory =
  | "solar_panel"
  | "inverter"
  | "ev_charger"
  | "battery"
  | "meter"
  | "other";
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

export interface Equipment extends Mutable {
  id: string;
  org_id: string;
  site_id: string | null;
  name: string;
  category: EquipmentCategory;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
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
  company_id: string | null;
  site_id: string | null;
  title: string;
  service_type: ServiceType;
  start_date: string;
  frequency_per_year: number;
  duration_years: number;
  end_date: string | null;
  technician_id: string | null;
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
  subject: string;
  status: CaseStatus;
  case_type: string | null;
  case_from: string | null;
  note: string | null;
  action: string | null;
  employee: string | null;
  team: string | null;
  company_id: string | null;
  contact_id: string | null;
  case_date: string | null;
  source: string | null;
  owner_id: string | null;
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
    };
    Enums: {
      member_role: MemberRole;
      lead_status: LeadStatus;
      activity_type: ActivityType;
    };
    CompositeTypes: Record<string, never>;
  };
}
