import { SERVICE_BOARDS, type ServiceBoardValue } from "@/lib/departments";

/**
 * The department that owns a case and begins its code: MRD-0826-00001.
 *
 * Deliberately the same list as the Service Boards — a case opened by MRD is
 * worked on MRD's board, and two lists that have to agree are one list.
 */
export const CASE_DEPTS = SERVICE_BOARDS.map((b) => b.value);
export type CaseDept = ServiceBoardValue;
export const DEFAULT_CASE_DEPT: CaseDept = "MRD";
