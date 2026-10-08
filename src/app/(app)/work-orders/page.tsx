import { rows, fetchAll } from "@/lib/data";
import type { WorkOrder } from "@/lib/database.types";
import { WorkOrdersView } from "./work-orders-view";
import { searchedRecordNumber } from "@/lib/search";
import { requireFullAccess } from "@/lib/page-access";

const WO_PAGE_LIMIT = 200;

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; case?: string; visit?: string }>;
}) {
  const { supabase, org } = await requireFullAccess();
  const sp = await searchParams;
  const search = (sp.q ?? "").trim();
  // Arriving from a case that has just been opened — see cases-view.
  const fromCase = (sp.case ?? "").trim() || null;
  // Arriving from a contract round that wants a job raising for it.
  const fromVisit = (sp.visit ?? "").trim() || null;

  // ?q= searches server-side so older rows stay reachable as the table grows.
  let searchOr: string | null = null;
  if (search) {
    // Escape ilike wildcards; drop chars that would break the .or() syntax.
    const term = search.replace(/[%_]/g, "\\$&").replace(/[,()]/g, " ").trim();
    // The code people quote is the report number now, so search that too.
    const ors = [
      `title.ilike.%${term}%`,
      `report_no.ilike.%${term}%`,
      `site_address.ilike.%${term}%`,
    ];
    const n = searchedRecordNumber(search);
    if (n !== null) ors.push(`number.eq.${n}`);
    searchOr = ors.join(",");
  }
  // The linked assets and the customer's name ride along embedded. Fetching
  // the whole junction table org-wide would silently truncate at PostgREST's
  // 1,000-row cap; fetching every company just to name the listed jobs' was
  // most of this page's weight, re-sent on every search keystroke.
  // (The form's pickers load when the form opens — form-options.ts.)
  const woBase = () => {
    const q = supabase
      .from("work_orders")
      .select("*, work_order_assets(equipment_id), companies(name)")
      .eq("org_id", org.id);
    return searchOr ? q.or(searchOr) : q;
  };
  // The newest WO_PAGE_LIMIT jobs, plus every unfinished one however old.
  // The status chips and the schedule tab filter what is loaded, so with the
  // newest 200 alone an open job raised months ago sat in no chip and on no
  // schedule. A search already narrows the list, so it needs only the first.
  const recentQuery = woBase().order("created_at", { ascending: false }).limit(WO_PAGE_LIMIT);
  const openQuery = searchOr
    ? Promise.resolve([])
    : fetchAll(() =>
        woBase()
          .not("status", "in", "(completed,cancelled)")
          .order("created_at", { ascending: false })
          .order("id")
      );

  // One parallel wave — every query here depends only on the session.
  const [woRes, openRows, techRes, visitRes] = await Promise.all([
    recentQuery,
    openQuery,
    supabase
      .from("technicians")
      .select("id, name")
      .eq("org_id", org.id)
      .eq("active", true)
      .order("name")
      .limit(500),
    fromVisit
      ? supabase
          .from("service_visits")
          .select("id, seq, due_date, contract_id")
          .eq("id", fromVisit)
          .eq("org_id", org.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  type Row = WorkOrder & {
    work_order_assets?: { equipment_id: string }[];
    companies?: { name: string } | null;
  };
  const recent = rows(woRes) as Row[];
  const byId = new Map(recent.map((w) => [w.id as string, w]));
  for (const w of openRows as Row[]) if (!byId.has(w.id)) byId.set(w.id, w);
  const merged = [...byId.values()].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
  );
  const technicians = rows(techRes);

  const assetIdsByWo: Record<string, string[]> = {};
  const companyNames: Record<string, string> = {};
  const workOrders = merged.map(({ work_order_assets, companies, ...w }) => {
    if (work_order_assets?.length)
      assetIdsByWo[w.id] = work_order_assets.map((l) => l.equipment_id);
    if (w.company_id && companies?.name) companyNames[w.company_id] = companies.name;
    return w;
  });

  return (
    <WorkOrdersView
      workOrders={workOrders}
      initialQuery={search}
      initialCaseId={fromCase}
      initialVisit={
        visitRes.data
          ? {
              id: visitRes.data.id as string,
              seq: visitRes.data.seq as number,
              due_date: visitRes.data.due_date as string,
              contract_id: visitRes.data.contract_id as string,
            }
          : null
      }
      limitHit={recent.length === WO_PAGE_LIMIT}
      openAlwaysShown={!search}
      technicians={technicians ?? []}
      companyNames={companyNames}
      assetIdsByWo={assetIdsByWo}
    />
  );
}
