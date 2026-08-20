import type { SessionContext } from "@/lib/data";
import { rows } from "@/lib/data";
import type { CaseOption } from "./work-order-modal";

/** Newest cases offered in the picker. Older ones are reachable from the case. */
const CASE_LIMIT = 500;

/**
 * The cases a work order can be raised against, each carrying what the form
 * fills in when one is picked: who reported it, from where, and which machines
 * are affected. Loaded here rather than in each page so the list and the detail
 * view offer the same thing.
 */
export async function loadCaseOptions(
  supabase: SessionContext["supabase"],
  orgId: string
): Promise<CaseOption[]> {
  const casesRes = await supabase
    .from("cases")
    .select("id, code, number, subject, note, company_id, site_id, contact_id")
    .eq("org_id", orgId)
    .order("number", { ascending: false })
    .limit(CASE_LIMIT);
  const cases = rows(casesRes);
  if (!cases.length) return [];

  const linksRes = await supabase
    .from("case_assets")
    .select("case_id, equipment_id")
    .in("case_id", cases.map((c) => c.id as string));
  const assetIds: Record<string, string[]> = {};
  for (const l of rows(linksRes)) {
    (assetIds[l.case_id as string] ??= []).push(l.equipment_id as string);
  }

  return cases.map((c) => ({
    id: c.id as string,
    // The code is what anyone quotes; the old running number is the fallback
    // for cases opened before there was one.
    name: `${c.code ?? (c.number ? `CASE-${String(c.number).padStart(4, "0")}` : "เคส")} · ${c.subject}`,
    company_id: (c.company_id as string) ?? null,
    site_id: (c.site_id as string) ?? null,
    contact_id: (c.contact_id as string) ?? null,
    subject: (c.subject as string) ?? "",
    note: (c.note as string) ?? "",
    asset_ids: assetIds[c.id as string] ?? [],
  }));
}
