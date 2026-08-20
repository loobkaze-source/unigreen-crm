/**
 * The department that owns a case, and the first three letters of its code:
 * MRD-0826-00001. Add to this list to offer another; the running number is
 * kept per department per month by the database (migration 0039), so a new one
 * starts at 00001 in the month it first appears.
 */
export const CASE_DEPTS = ["MRD", "UNG", "ETD"] as const;
export type CaseDept = (typeof CASE_DEPTS)[number];
export const DEFAULT_CASE_DEPT: CaseDept = "MRD";
