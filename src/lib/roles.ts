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

// ---------------------------------------------------------------------------
// Multi-role helpers. A member holds a SET of roles (organization_members
// .app_roles); `app_role` is only the mirrored primary one. Always ask "does
// this member hold role X" rather than comparing a single string.
// ---------------------------------------------------------------------------

/** True when the member holds any of `wanted`. */
export function hasRole(roles: readonly string[] | null | undefined, ...wanted: readonly string[]) {
  if (!roles?.length) return false;
  return wanted.some((w) => roles.includes(w));
}

/** The role shown where only one fits, and mirrored into `app_role`. */
export function primaryRole(roles: readonly string[] | null | undefined): string | null {
  if (!roles?.length) return null;
  return roles.includes("admin") ? "admin" : roles[0];
}

/** A department applies when at least one held role is department-scoped. */
export function isDeptScoped(roles: readonly string[] | null | undefined) {
  return (roles ?? []).some((r) => DEPT_ROLES.has(r));
}

/** Field technicians get a reduced nav — but only when that is ALL they are.
 *  Someone who is Technician *and* Sales still needs the full app. */
export function isTechnicianOnly(roles: readonly string[] | null | undefined) {
  const list = roles ?? [];
  return list.length > 0 && list.every((r) => r === "Technician");
}
