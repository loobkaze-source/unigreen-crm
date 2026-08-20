import type {
  WorkOrderPriority,
  WorkOrderStatus,
  WorkOrderType,
} from "@/lib/database.types";

type Tone = "default" | "primary" | "success" | "warning" | "danger" | "info" | "muted";

/**
 * The system the job is on. Not the shape of the visit — CM/PM says whether it
 * is corrective, and the six ticks on the service report say what was done.
 *
 * The values are slugs so a label can be reworded without touching a single
 * stored row; add to the list to offer another machine.
 */
export const WO_TYPES: { value: WorkOrderType; label: string }[] = [
  { value: "atg_fafnir", label: "ATG_ FAFNIR -DEll" },
  { value: "vru", label: "VRU" },
  { value: "hanging_part", label: "Hanging Part" },
  { value: "submersible_pump", label: "Submersible Pump" },
  { value: "diaphragm_pump", label: "Diaphragm Pump" },
  { value: "air_compressor", label: "Air Compressor" },
  { value: "double_wall_pipe", label: "Double-Wall Pipe" },
  { value: "dispenser", label: "Dispensor" },
  { value: "pos", label: "POS" },
  { value: "ev_charger", label: "EV Charger" },
  { value: "solar_battery", label: "Solar Cell& Battery" },
  { value: "water_pump", label: "Water Pump" },
];

/** What a job opened before this list existed still shows. */
export const DEFAULT_WO_TYPE: WorkOrderType = "atg_fafnir";

export const WO_STATUSES: { value: WorkOrderStatus; label: string; tone: Tone }[] = [
  { value: "new", label: "ใหม่", tone: "muted" },
  { value: "scheduled", label: "นัดหมายแล้ว", tone: "info" },
  { value: "in_progress", label: "กำลังดำเนินการ", tone: "warning" },
  { value: "on_hold", label: "พักไว้", tone: "default" },
  { value: "completed", label: "เสร็จสิ้น", tone: "success" },
  { value: "cancelled", label: "ยกเลิก", tone: "danger" },
];

export const WO_PRIORITIES: { value: WorkOrderPriority; label: string; tone: Tone }[] = [
  { value: "low", label: "ต่ำ", tone: "muted" },
  { value: "normal", label: "ปกติ", tone: "default" },
  { value: "high", label: "สูง", tone: "warning" },
  { value: "urgent", label: "ด่วน", tone: "danger" },
];

export const WO_JOB_CLASS = [
  { value: "CM", label: "CM (ซ่อมแก้ไข)" },
  { value: "PM", label: "PM (บำรุงรักษาเชิงป้องกัน)" },
] as const;

export const WO_BILLING = [
  { value: "warranty", label: "อยู่ในประกัน", tone: "success" as Tone },
  { value: "contract", label: "สัญญาบำรุงรักษา", tone: "info" as Tone },
  { value: "paid", label: "มีค่าซ่อม", tone: "warning" as Tone },
] as const;

/**
 * ข้อ 9–14 ในใบรายงานการซ่อม, in the order they are printed on it, so the card
 * reads the same way round as the paper the technicians already know.
 */
export const WO_WORK_KINDS = [
  { value: "installation", label: "งานติดตั้ง" },
  { value: "repair", label: "งานซ่อม" },
  { value: "cmn", label: "ตรวจเช็คการทำงาน (CMN)" },
  { value: "calibrate", label: "ตรวจความเที่ยงตรง" },
  { value: "relocate", label: "ย้ายอุปกรณ์" },
  { value: "pm", label: "ซ่อมบำรุง (P.M.)" },
] as const;

export const workKindLabel = (v: string) =>
  WO_WORK_KINDS.find((x) => x.value === v)?.label ?? v;

export const jobClassLabel = (v: string | null) =>
  WO_JOB_CLASS.find((x) => x.value === v)?.label ?? v ?? "";
export const billingMeta = (v: string | null) =>
  WO_BILLING.find((x) => x.value === v);

export const typeLabel = (v: WorkOrderType) =>
  WO_TYPES.find((x) => x.value === v)?.label ?? v;
export const statusMeta = (v: WorkOrderStatus) =>
  WO_STATUSES.find((x) => x.value === v) ?? WO_STATUSES[0];
export const priorityMeta = (v: WorkOrderPriority) =>
  WO_PRIORITIES.find((x) => x.value === v) ?? WO_PRIORITIES[1];

/**
 * What a job is called.
 *
 * One raised against a case takes the case's number and which visit it is —
 * MRD-0826-00001-01 — because that is the number on the report the customer
 * signs, and the number they quote back when they ring. WO-0001 is what is
 * left for a job with no case to derive one from.
 */
export const woCode = (
  w: { number: number | null; report_no?: string | null } | number | null
) => {
  if (w !== null && typeof w === "object") {
    return w.report_no?.trim() || serial(w.number);
  }
  return serial(w);
};

const serial = (n: number | null) =>
  n == null ? "WO-—" : `WO-${String(n).padStart(4, "0")}`;
