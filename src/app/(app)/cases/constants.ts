import { SERVICE_BOARDS, type ServiceBoardValue } from "@/lib/departments";
import type { CaseStatus } from "@/lib/database.types";

/** Case statuses with the labels and badge tones every view shows them in. */
export const CASE_STATUS: {
  value: CaseStatus;
  label: string;
  tone: "info" | "warning" | "success" | "muted";
}[] = [
  { value: "open", label: "เปิด", tone: "info" },
  { value: "in_progress", label: "กำลังดำเนินการ", tone: "warning" },
  { value: "closed", label: "ปิดแล้ว", tone: "success" },
];
export const caseStatusMeta = (s: CaseStatus) =>
  CASE_STATUS.find((x) => x.value === s) ?? CASE_STATUS[0];

/**
 * The department that owns a case and begins its code: MRD-0826-00001.
 *
 * Deliberately the same list as the Service Boards — a case opened by MRD is
 * worked on MRD's board, and two lists that have to agree are one list.
 */
export const CASE_DEPTS = SERVICE_BOARDS.map((b) => b.value);
export type CaseDept = ServiceBoardValue;
export const DEFAULT_CASE_DEPT: CaseDept = "MRD";
