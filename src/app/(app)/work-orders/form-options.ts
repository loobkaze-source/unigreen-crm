"use server";

import { getSessionContext, rows, fetchAll } from "@/lib/data";
import { isTechnicianOnly } from "@/lib/roles";
import { ASSET_LABEL_COLUMNS, assetLabel } from "@/lib/asset";
import { loadCaseOptions } from "./case-options";
import { loadContractOptions } from "./contract-options";
import type {
  AssetOption,
  CaseOption,
  ContactOption,
  ContractOption,
  Option,
  SiteOption,
} from "./work-order-modal";

/**
 * What the work-order form offers in its pickers, loaded when the form opens.
 *
 * These used to ride along with every render of the work-order list and the
 * job page: every company, site, contact, case, contract and — the bulk of it
 * — every one of the org's ~6,500 assets, re-sent on each debounced search
 * keystroke and each refresh after a save, and sent to technicians' phones
 * that never open the form at all. Now the pages carry only what they show.
 */
export type WorkOrderFormOptions = {
  companies: Option[];
  contacts: ContactOption[];
  sites: SiteOption[];
  cases: CaseOption[];
  contracts: ContractOption[];
};

type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };

/** Field technicians never edit a job, so they never need the form. */
async function editorContext() {
  const ctx = await getSessionContext();
  if (!ctx.isAdmin && isTechnicianOnly(ctx.appRoles)) return null;
  return ctx;
}

export async function loadWorkOrderFormOptions(): Promise<Loaded<WorkOrderFormOptions>> {
  const ctx = await editorContext();
  if (!ctx) return { ok: false, error: "ไม่มีสิทธิ์แก้ไขใบงาน" };
  const { supabase, org } = ctx;
  try {
    const [companies, contacts, sites, cases, contracts] = await Promise.all([
      fetchAll(() =>
        supabase.from("companies").select("id, name").eq("org_id", org.id).order("name").order("id")
      ),
      supabase
        .from("contacts")
        .select("id, first_name, last_name, company_id")
        .eq("org_id", org.id)
        .order("first_name")
        .limit(500),
      fetchAll(() =>
        supabase
          .from("sites")
          .select("id, name, company_id, address, map_url")
          .eq("org_id", org.id)
          .order("name")
          .order("id")
      ),
      loadCaseOptions(supabase, org.id),
      loadContractOptions(supabase, org.id),
    ]);
    return {
      ok: true,
      data: {
        companies: companies as Option[],
        contacts: rows(contacts).map((c) => ({
          id: c.id as string,
          name: [c.first_name, c.last_name].filter(Boolean).join(" "),
          company_id: (c.company_id as string) ?? null,
        })),
        sites: sites as SiteOption[],
        cases,
        contracts,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "โหลดตัวเลือกไม่สำเร็จ" };
  }
}

type AssetRow = Parameters<typeof assetLabel>[0] & { id: string; site_id: string | null };

/**
 * The assets the form can tick: the chosen site's, plus any already ticked
 * (a job can carry an asset from elsewhere, and it must stay visible to be
 * unticked). One site's worth — tens of rows, not the whole register.
 */
export async function loadWorkOrderAssets(
  siteId: string | null,
  selectedIds: string[]
): Promise<Loaded<AssetOption[]>> {
  const ctx = await editorContext();
  if (!ctx) return { ok: false, error: "ไม่มีสิทธิ์แก้ไขใบงาน" };
  const { supabase, org } = ctx;
  const ids = [...new Set(selectedIds.filter(Boolean))].slice(0, 200);
  if (!siteId && !ids.length) return { ok: true, data: [] };

  const cols = `id, site_id, ${ASSET_LABEL_COLUMNS}`;
  try {
    const [bySite, byId] = await Promise.all([
      siteId
        ? fetchAll<AssetRow>(
            () =>
              supabase
                .from("equipment")
                .select(cols)
                .eq("org_id", org.id)
                .eq("site_id", siteId)
                .order("code")
                .order("id") as never
          )
        : Promise.resolve([] as AssetRow[]),
      ids.length
        ? supabase.from("equipment").select(cols).eq("org_id", org.id).in("id", ids)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const seen = new Set<string>();
    const out: AssetOption[] = [];
    for (const a of [...bySite, ...(rows(byId) as AssetRow[])]) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push({ id: a.id, site_id: a.site_id ?? null, name: assetLabel(a) });
    }
    return { ok: true, data: out };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "โหลดรายการ Asset ไม่สำเร็จ" };
  }
}
