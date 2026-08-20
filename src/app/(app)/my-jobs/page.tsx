import { getSessionContext, rows } from "@/lib/data";
import { SUPABASE_URL } from "@/lib/supabase/env";
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
    return <MyJobsView linked={false} technicianName={null} jobs={[]} orgId={org.id} />;
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
  // Site contacts come from two places: the person named on the work order and
  // the site's own default contact. Both are worth a tap-to-call on site.
  const siteRowsRes = siteIds.length
    ? await supabase
        .from("sites")
        .select("id, name, address, map_url, contact_id")
        .in("id", siteIds as string[])
    : { data: [], error: null };
  const siteRows = (siteRowsRes.data ?? []) as {
    id: string;
    name: string;
    address: string | null;
    map_url: string | null;
    contact_id: string | null;
  }[];

  const contactIds = [
    ...new Set(
      [
        ...workOrders.map((w) => w.contact_id),
        ...siteRows.map((s) => s.contact_id),
      ].filter(Boolean)
    ),
  ] as string[];

  const [companiesRes, contactsRes] = await Promise.all([
    companyIds.length
      ? supabase.from("companies").select("id, name, phone").in("id", companyIds as string[])
      : Promise.resolve({ data: [], error: null }),
    contactIds.length
      ? supabase
          .from("contacts")
          .select("id, first_name, last_name, phone")
          .in("id", contactIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const contactById = new Map(
    (contactsRes.data ?? []).map((c) => [
      c.id as string,
      {
        name: [c.first_name, c.last_name].filter(Boolean).join(" "),
        phone: (c.phone as string) || null,
      },
    ])
  );
  const companyById = new Map(
    (companiesRes.data ?? []).map((c) => [c.id as string, c as { name: string; phone: string | null }])
  );
  const siteById = new Map(siteRows.map((s) => [s.id, s]));

  const jobs = workOrders.map((w) => {
    const site = w.site_id ? siteById.get(w.site_id) : undefined;
    const contactId = w.contact_id ?? site?.contact_id ?? null;
    const contact = contactId ? contactById.get(contactId) : undefined;
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
      // Prefer the person named on the job; fall back to the site's contact.
      contactName: contact?.name ?? null,
      contactPhone: contact?.phone ?? null,
      siteName: site?.name ?? null,
      // The WO carries its own copy of the address/map for ad-hoc locations.
      address: w.site_address || site?.address || null,
      mapUrl: w.site_map_url || site?.map_url || null,
      signatureUrl: w.signature_path
        ? `${SUPABASE_URL}/storage/v1/object/public/wo-photos/${w.signature_path}`
        : null,
      signedBy: w.signed_by,
      signedAt: w.signed_at,
    };
  });

  return (
    <MyJobsView
      linked
      technicianName={(tech.nickname as string) || (tech.name as string)}
      jobs={jobs}
      orgId={org.id}
    />
  );
}
