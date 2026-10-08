import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/data";
import { isTechnicianOnly } from "@/lib/roles";
import { TECH_HOME } from "@/lib/nav-access";

/**
 * getSessionContext() for a page a pure field technician must not see.
 *
 * The sidebar hides these pages from them and app-shell redirects on the
 * client — but only after the server has already rendered the page and sent
 * its data (customers, sites, assets, contracts…) to the browser. This turns
 * them away before any of it is fetched.
 *
 * Kept out of nav-access.ts: that module is imported by a Client Component,
 * and this one reaches the server session.
 */
export async function requireFullAccess() {
  const ctx = await getSessionContext();
  if (!ctx.isAdmin && isTechnicianOnly(ctx.appRoles)) redirect(TECH_HOME);
  return ctx;
}
