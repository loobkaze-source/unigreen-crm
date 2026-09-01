import { getSessionContext, rows, fetchAllRes } from "@/lib/data";
import { loadConflicts } from "@/lib/schedule-conflicts";
import { ActivitiesView } from "./activities-view";

export default async function ActivitiesPage() {
  const { supabase, org } = await getSessionContext();

  const [activitiesRes, companiesRes, contactsRes, dealsRes, techRes, crewRes] =
    await Promise.all([
      supabase
        .from("activities")
        .select("*")
        .eq("org_id", org.id)
        .order("done", { ascending: true })
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(500),
      fetchAllRes(() =>
        supabase
          .from("companies")
          .select("id, name")
          .eq("org_id", org.id)
          .order("name")
          .order("id")
      ),
      fetchAllRes(() =>
        supabase
          .from("contacts")
          .select("id, first_name, last_name")
          .eq("org_id", org.id)
          .order("first_name")
          .order("id")
      ),
      fetchAllRes(() =>
        supabase
          .from("deals")
          .select("id, title")
          .eq("org_id", org.id)
          .order("title")
          .order("id")
      ),
      supabase
        .from("technicians")
        .select("id, name, nickname")
        .eq("org_id", org.id)
        .eq("active", true)
        .order("name")
        .limit(500),
      // Who is on which course. Small enough to fetch whole — one row per
      // person per session, and a session is a dozen people at most.
      fetchAllRes(() =>
        supabase.from("activity_technicians").select("activity_id, technician_id").eq("org_id", org.id)
      ),
    ]);

  const activities = rows(activitiesRes);
  const companies = rows(companiesRes);
  const contacts = rows(contactsRes);
  const deals = rows(dealsRes);
  const technicians = (rows(techRes) ?? []).map((t) => ({
    id: t.id as string,
    name: (t.nickname as string) ? `${t.name} (${t.nickname})` : (t.name as string),
  }));
  const crew: Record<string, string[]> = {};
  for (const r of rows(crewRes) ?? []) {
    const key = r.activity_id as string;
    (crew[key] ??= []).push(r.technician_id as string);
  }
  // Who is down for two things on one day, jobs and courses together.
  const conflicts = await loadConflicts(supabase, org.id);

  return (
    <ActivitiesView
      activities={activities}
      technicians={technicians}
      crew={crew}
      conflicts={conflicts}
      companies={companies ?? []}
      contacts={(contacts ?? []).map((c) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" "),
      }))}
      deals={(deals ?? []).map((d) => ({ id: d.id, name: d.title }))}
    />
  );
}
