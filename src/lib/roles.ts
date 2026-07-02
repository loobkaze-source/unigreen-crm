/**
 * Business roles an admin can assign to a member. Kept in a plain module (NOT
 * a "use server" file) so it can be imported by Client Components — exports
 * from a "use server" file become server-action references, not the array.
 */
export const USER_ROLES = [
  "admin",
  "Sales",
  "Manager",
  "Technician",
  "Dispatcher",
  "Technical Supporter",
  "Customer Service",
  "Accounting",
  "Safety",
] as const;

/** Roles allowed to open/manage cases (admin can always do everything). */
export const CASE_ROLES = ["Customer Service", "Dispatcher"] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Roles that participate in a sales pipeline board. */
export const PIPELINE_ROLES = ["Sales", "Manager"] as const;

/** Roles that participate in a service board. */
export const SERVICE_ROLES = ["Dispatcher", "Technical Supporter", "Technician"] as const;

/** Roles that are scoped to a single department. */
export const DEPT_ROLES = new Set<string>([
  "Manager",
  "Sales",
  "Dispatcher",
  "Technical Supporter",
  "Technician",
]);
