import type { SessionContext } from "@/lib/data";
import { rows } from "@/lib/data";
import type { ContractOption } from "./work-order-modal";

/**
 * The service contracts a work order can be raised against, with what the form
 * fills in from one: whose contract it is, which site it covers, and the board
 * it is run on.
 *
 * Cancelled ones are left out — nobody raises work under an agreement that has
 * been called off — but completed ones stay, because a job can still be closing
 * out the last round of a contract that has run its term.
 */
/** A to-one embed comes back as an object; the generated types say array. */
const embeddedName = (v: unknown): string | null => {
  const row = Array.isArray(v) ? v[0] : v;
  return (row as { name?: string } | null)?.name ?? null;
};

export async function loadContractOptions(
  supabase: SessionContext["supabase"],
  orgId: string
): Promise<ContractOption[]> {
  const res = await supabase
    .from("service_contracts")
    .select("id, contract_no, title, company_id, site_id, board_key, status, sites(name)")
    .eq("org_id", orgId)
    .neq("status", "cancelled")
    .order("title");

  return rows(res).map((c) => ({
    id: c.id as string,
    // The number leads; the title is "Solar PM 5Y" fifty-seven times over, so
    // the site is what tells one option from the next.
    name: [c.contract_no, c.title, embeddedName(c.sites)].filter(Boolean).join(" · "),
    title: c.title as string,
    company_id: (c.company_id as string) ?? null,
    site_id: (c.site_id as string) ?? null,
    board_key: (c.board_key as string) ?? null,
  }));
}
