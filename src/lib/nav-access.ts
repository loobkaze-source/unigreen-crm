/**
 * Routes a Technician may reach — everything from "ไซต์งาน" (Sites) down in the
 * nav, minus the admin-only Users page. Used to filter the sidebar and to guard
 * access both server-side (layout) and client-side (app-shell).
 */
export const TECH_ROUTES = [
  "/sites",
  "/work-orders",
  "/cases",
  "/service-contracts",
  "/warranties",
  "/technicians",
  "/products",
  "/activities",
] as const;

export const routeMatches = (path: string, href: string) =>
  path === href || path.startsWith(href + "/");

export function isTechnicianAllowed(path: string): boolean {
  if (path.startsWith("/account") || path.startsWith("/set-password")) return true;
  return TECH_ROUTES.some((r) => routeMatches(path, r));
}
