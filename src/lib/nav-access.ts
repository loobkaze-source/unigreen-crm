/** Where a field technician lands — their own job list, not the dashboard. */
export const TECH_HOME = "/my-jobs";

/**
 * A field technician sees ONE thing: their own jobs. Everything else — customers,
 * sites, assets, the org-wide work-order list, contracts, products — is hidden.
 *
 * This filters the sidebar and guards navigation client-side (app-shell).
 * Per-record visibility is enforced on the server where it matters: the work
 * order detail page refuses a job that isn't assigned to them.
 */
export const TECH_ROUTES = [TECH_HOME] as const;

export const routeMatches = (path: string, href: string) =>
  path === href || path.startsWith(href + "/");

export function isTechnicianAllowed(path: string): boolean {
  if (path.startsWith("/account") || path.startsWith("/set-password")) return true;
  // A job is worked from its detail page (checklist, photos, parts), so that
  // route stays reachable — the bare /work-orders list, which shows everyone
  // else's jobs, does not.
  if (path.startsWith("/work-orders/")) return true;
  return TECH_ROUTES.some((r) => routeMatches(path, r));
}
