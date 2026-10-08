import { getSessionContext, rows, fetchAll } from "@/lib/data";
import { SUPABASE_URL } from "@/lib/supabase/env";
import type { WorkOrder } from "@/lib/database.types";
import { MyJobsView } from "./my-jobs-view";

type ContactEmbed = {
  first_name: string;
  last_name: string | null;
  phone: string | null;
} | null;

type JobRow = WorkOrder & {
  companies: { name: string; phone: string | null } | null;
  contacts: ContactEmbed;
  sites:
    | {
        id: string;
        name: string;
        address: string | null;
        map_url: string | null;
        contacts: ContactEmbed;
      }
    | null;
};

const DONE_STATUSES = ["completed", "cancelled"];
/** Finished jobs shown — enough to re-open one to re-sign or print. */
const RECENT_DONE = 20;

const contactName = (c: ContactEmbed) =>
  c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : null;

/**
 * "งานของฉัน" — the field technician's home screen, built phone-first.
 * Shows only the work orders assigned to the signed-in user's technician
 * record, grouped by urgency so the next job is the first thing on screen.
 */
export default async function MyJobsPage() {
  const { supabase, org, userId } = await getSessionContext();

  // The signed-in user maps to a row in `technicians` (technicians.user_id).
  const { data: tech, error: techErr } = await supabase
    .from("technicians")
    .select("id, name, nickname")
    .eq("org_id", org.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (techErr) throw new Error(techErr.message);

  if (!tech) {
    return (
      <MyJobsView linked={false} technicianName={null} jobs={[]} doneTotal={0} orgId={org.id} />
    );
  }

  // Everything a technician needs on site rides along embedded — customer,
  // site (with its default contact), and the person named on the job. This
  // page is opened over mobile data, where each extra round trip is felt.
  const select =
    "*, companies(name, phone), contacts(first_name, last_name, phone), sites(id, name, address, map_url, contacts(first_name, last_name, phone))";
  const mine = () =>
    supabase.from("work_orders").select(select).eq("org_id", org.id).eq("technician_id", tech.id);

  // Two lists, not one capped list: a single "first 200 by date" filled up
  // with old finished jobs, and once a technician had 200 of those, newly
  // assigned work never reached the page at all. Every unfinished job, then
  // only the most recent finished ones (and how many there are in all).
  const [openRows, doneRes] = await Promise.all([
    fetchAll<JobRow>(
      () =>
        mine()
          .not("status", "in", `(${DONE_STATUSES.join(",")})`)
          .order("scheduled_start", { ascending: true, nullsFirst: false })
          .order("id") as never
    ),
    supabase
      .from("work_orders")
      .select(select, { count: "exact" })
      .eq("org_id", org.id)
      .eq("technician_id", tech.id)
      .in("status", DONE_STATUSES)
      .order("completed_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(RECENT_DONE),
  ]);
  const workOrders = [...openRows, ...rows<JobRow>(doneRes as never)];
  const doneTotal = doneRes.count ?? 0;

  const jobs = workOrders.map((w) => {
    // Prefer the person named on the job; fall back to the site's contact.
    const contact = w.contacts ?? w.sites?.contacts ?? null;
    return {
      id: w.id,
      number: w.number,
      report_no: w.report_no,
      title: w.title,
      status: w.status,
      type: w.type,
      priority: w.priority,
      job_class: w.job_class,
      scheduled_start: w.scheduled_start,
      scheduled_end: w.scheduled_end,
      accepted_at: w.accepted_at,
      company: w.companies?.name ?? null,
      companyPhone: w.companies?.phone ?? null,
      contactName: contactName(contact),
      contactPhone: contact?.phone ?? null,
      siteName: w.sites?.name ?? null,
      // The WO carries its own copy of the address/map for ad-hoc locations.
      address: w.site_address || w.sites?.address || null,
      mapUrl: w.site_map_url || w.sites?.map_url || null,
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
      doneTotal={doneTotal}
      orgId={org.id}
    />
  );
}
