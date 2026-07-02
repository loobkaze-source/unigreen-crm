import { getSessionContext, rows } from "@/lib/data";
import { ActivitiesView } from "./activities-view";

export default async function ActivitiesPage() {
  const { supabase, org } = await getSessionContext();

  const [activitiesRes, companiesRes, contactsRes, dealsRes] =
    await Promise.all([
      supabase
        .from("activities")
        .select("*")
        .eq("org_id", org.id)
        .order("done", { ascending: true })
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("companies").select("id, name").eq("org_id", org.id).order("name"),
      supabase
        .from("contacts")
        .select("id, first_name, last_name")
        .eq("org_id", org.id)
        .order("first_name"),
      supabase.from("deals").select("id, title").eq("org_id", org.id).order("title"),
    ]);

  const activities = rows(activitiesRes);
  const companies = rows(companiesRes);
  const contacts = rows(contactsRes);
  const deals = rows(dealsRes);

  return (
    <ActivitiesView
      activities={activities}
      companies={companies ?? []}
      contacts={(contacts ?? []).map((c) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" "),
      }))}
      deals={(deals ?? []).map((d) => ({ id: d.id, name: d.title }))}
    />
  );
}
