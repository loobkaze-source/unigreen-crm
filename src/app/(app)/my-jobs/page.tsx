import { getSessionContext, rows } from "@/lib/data";
import type { WorkOrder } from "@/lib/database.types";
import { MyJobsView } from "./my-jobs-view";

/**
 * "งานของฉัน" — the field technician's home screen, built phone-first.
 * Shows only the work orders assigned to the signed-in user's technician
 * record, grouped by urgency so the next job is the first thing on screen.
 */
export default async function MyJobsPage() {
  const { supabase, org, userId } = await getSessionContext();

  // The signed-in user maps to a row in `technicians` (technicians.user_id).
  const { data: tech } = await supabase
    .from("technicians")
    .select("id, name, nickname")
    .eq("org_id", org.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!tech) {
    return <MyJobsView linked={false} technicianName={null} jobs={[]} />;
  }

  const workOrders = rows<WorkOrder>(
    (await supabase
      .from("work_orders")
      .select("*")
      .eq("org_id", org.id)
      .eq("technician_id", tech.id)
      .order("scheduled_start", { ascending: true, nullsFirst: false })
      .limit(200)) as never
  );

  // Resolve the labels a technician actually needs on site: which customer,
  // which site, and how to get there.
  const companyIds = [...new Set(workOrders.map((w) => w.company_id).filter(Boolean))];
  const siteIds = [...new Set(workOrders.map((w) => w.site_id).filter(Boolean))];
  const [companiesRes, sitesRes] = await Promise.all([
    companyIds.length
      ? supabase.from("companies").select("id, name, phone").in("id", companyIds as string[])
      : Promise.resolve({ data: [], error: null }),
    siteIds.length
      ? supabase.from("sites").select("id, name, address, map_url").in("id", siteIds as string[])
      : Promise.resolve({ data: [], error: null }),
  ]);
  const companyById = new Map(
    (companiesRes.data ?? []).map((c) => [c.id as string, c as { name: string; phone: string | null }])
  );
  const siteById = new Map(
    (sitesRes.data ?? []).map((s) => [
      s.id as string,
      s as { name: string; address: string | null; map_url: string | null },
    ])
  );

  const jobs = workOrders.map((w) => {
    const site = w.site_id ? siteById.get(w.site_id) : undefined;
    return {
      id: w.id,
      number: w.number,
      title: w.title,
      status: w.status,
      type: w.type,
      priority: w.priority,
      job_class: w.job_class,
      scheduled_start: w.scheduled_start,
      scheduled_end: w.scheduled_end,
      accepted_at: w.accepted_at,
      company: w.company_id ? (companyById.get(w.company_id)?.name ?? null) : null,
      companyPhone: w.company_id ? (companyById.get(w.company_id)?.phone ?? null) : null,
      siteName: site?.name ?? null,
      // The WO carries its own copy of the address/map for ad-hoc locations.
      address: w.site_address || site?.address || null,
      mapUrl: w.site_map_url || site?.map_url || null,
    };
  });

  return (
    <MyJobsView
      linked
      technicianName={(tech.nickname as string) || (tech.name as string)}
      jobs={jobs}
    />
  );
}
