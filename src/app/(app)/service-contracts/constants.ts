import type { ServiceType, VisitStatus } from "@/lib/database.types";

type Tone = "default" | "primary" | "success" | "warning" | "danger" | "info" | "muted";

export const SERVICE_TYPES: { value: ServiceType; label: string }[] = [
  { value: "panel_cleaning", label: "ล้างแผงโซลาร์" },
  { value: "filter_cleaning", label: "ล้างฟิลเตอร์ (EV)" },
  { value: "inspection", label: "ตรวจเช็กระบบ" },
  { value: "maintenance", label: "บำรุงรักษา" },
  { value: "other", label: "อื่นๆ" },
];

export const VISIT_STATUSES: { value: VisitStatus; label: string; tone: Tone }[] = [
  { value: "pending", label: "รอดำเนินการ", tone: "muted" },
  { value: "done", label: "เสร็จแล้ว", tone: "success" },
  { value: "skipped", label: "ข้าม", tone: "warning" },
];

export const serviceTypeLabel = (v: ServiceType) =>
  SERVICE_TYPES.find((s) => s.value === v)?.label ?? v;
export const visitStatusMeta = (v: VisitStatus) =>
  VISIT_STATUSES.find((s) => s.value === v) ?? VISIT_STATUSES[0];
