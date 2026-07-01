import type {
  WorkOrderPriority,
  WorkOrderStatus,
  WorkOrderType,
} from "@/lib/database.types";

type Tone = "default" | "primary" | "success" | "warning" | "danger" | "info" | "muted";

export const WO_TYPES: { value: WorkOrderType; label: string }[] = [
  { value: "survey", label: "สำรวจหน้างาน" },
  { value: "installation", label: "ติดตั้ง" },
  { value: "maintenance", label: "บำรุงรักษา" },
  { value: "repair", label: "ซ่อมแซม" },
  { value: "other", label: "อื่นๆ" },
];

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
  { value: "paid", label: "มีค่าซ่อม", tone: "warning" as Tone },
] as const;

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

export const woCode = (n: number | null) =>
  n == null ? "WO-—" : `WO-${String(n).padStart(4, "0")}`;
