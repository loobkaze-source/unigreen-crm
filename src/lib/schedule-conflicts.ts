/**
 * Where a technician is expected to be on a given day.
 *
 * A job and a training course are different records and different pages, but a
 * person cannot be at both, so for this purpose they are the same thing: a name,
 * a day, and something they are down for.
 */
export type Booking = {
  technicianId: string;
  /** YYYY-MM-DD. */
  date: string;
  kind: "job" | "training";
  /** The record it came from, so a warning can point at it. */
  id: string;
  label: string;
  href: string;
};

/** Everything double-booked, keyed both ways so either page can ask. */
export type Conflicts = {
  /** `technicianId|YYYY-MM-DD` → everything they are down for that day. */
  byPerson: Record<string, Booking[]>;
  /** Work order or activity id → the clashes it is part of. */
  byRecord: Record<string, Booking[]>;
};

/**
 * The day, not the hour.
 *
 * Half these records carry no end time — a job is scheduled for Tuesday, a
 * course is a date on a calendar — so an overlap test would be inventing
 * precision the data does not have. Two things on one person on one day is
 * what a dispatcher wants to be told about anyway; they can read the times
 * themselves and decide it is fine.
 */
export function findConflicts(bookings: Booking[]): Conflicts {
  const grouped = new Map<string, Booking[]>();
  for (const b of bookings) {
    if (!b.technicianId || !b.date) continue;
    const key = `${b.technicianId}|${b.date}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(b);
  }

  const byPerson: Record<string, Booking[]> = {};
  const byRecord: Record<string, Booking[]> = {};
  for (const [key, list] of grouped) {
    // One person, one thing, one day is not a clash.
    if (list.length < 2) continue;
    byPerson[key] = list;
    for (const b of list) {
      (byRecord[b.id] ??= []).push(...list.filter((x) => x.id !== b.id));
    }
  }
  return { byPerson, byRecord };
}

/**
 * The server client exactly as `getSessionContext` hands it over — taken from
 * that function rather than restated, so the two cannot drift. Type-only, so
 * nothing of the server module is pulled in at runtime.
 */
type Db = Awaited<ReturnType<typeof import("@/lib/data").getSessionContext>>["supabase"];

/**
 * Reads every future-facing assignment in the org and returns what clashes.
 *
 * A job counts the technician it is assigned to and everyone on its crew; a
 * training course counts everyone booked on it. Finished and cancelled jobs
 * are left out — a person cannot be double-booked by something that already
 * happened.
 */
export async function loadConflicts(supabase: Db, orgId: string): Promise<Conflicts> {
  const [jobsRes, crewRes, actsRes, attendeesRes] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id, title, number, report_no, technician_id, scheduled_start, status")
      .eq("org_id", orgId)
      .not("scheduled_start", "is", null)
      .not("status", "in", "(completed,cancelled)")
      .limit(2000),
    supabase.from("work_order_technicians").select("work_order_id, technician_id").eq("org_id", orgId),
    supabase
      .from("activities")
      .select("id, subject, due_date, done")
      .eq("org_id", orgId)
      .eq("type", "training")
      .eq("done", false)
      .not("due_date", "is", null)
      .limit(2000),
    supabase.from("activity_technicians").select("activity_id, technician_id").eq("org_id", orgId),
  ]);

  const day = (t: string | null) => (t ? t.slice(0, 10) : "");
  const jobs = (jobsRes.data ?? []) as {
    id: string;
    title: string;
    number: number | null;
    report_no: string | null;
    technician_id: string | null;
    scheduled_start: string | null;
  }[];
  const acts = (actsRes.data ?? []) as { id: string; subject: string; due_date: string | null }[];

  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const actById = new Map(acts.map((a) => [a.id, a]));
  const bookings: Booking[] = [];

  const jobLabel = (j: (typeof jobs)[number]) =>
    `${j.report_no || (j.number ? `WO-${String(j.number).padStart(4, "0")}` : "ใบงาน")} · ${j.title}`;

  for (const j of jobs) {
    if (!j.technician_id) continue;
    bookings.push({
      technicianId: j.technician_id,
      date: day(j.scheduled_start),
      kind: "job",
      id: j.id,
      label: jobLabel(j),
      href: `/work-orders/${j.id}`,
    });
  }
  for (const c of (crewRes.data ?? []) as { work_order_id: string; technician_id: string }[]) {
    const j = jobById.get(c.work_order_id);
    // The assigned technician is often on the crew as well; one booking each.
    if (!j || j.technician_id === c.technician_id) continue;
    bookings.push({
      technicianId: c.technician_id,
      date: day(j.scheduled_start),
      kind: "job",
      id: j.id,
      label: jobLabel(j),
      href: `/work-orders/${j.id}`,
    });
  }
  for (const a of (attendeesRes.data ?? []) as { activity_id: string; technician_id: string }[]) {
    const act = actById.get(a.activity_id);
    if (!act) continue;
    bookings.push({
      technicianId: a.technician_id,
      date: day(act.due_date),
      kind: "training",
      id: act.id,
      label: `อบรม · ${act.subject}`,
      href: "/activities",
    });
  }

  return findConflicts(bookings);
}
