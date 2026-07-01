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
  "Job Dispatcher",
  "Accounting",
] as const;

export type UserRole = (typeof USER_ROLES)[number];
