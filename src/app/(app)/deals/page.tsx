import { getSessionContext, rows, fetchAllRes } from "@/lib/data";
import { DealsBoard } from "./deals-board";

export default async function DealsPage() {
  const { supabase, org, isAdmin, department } = await getSessionContext();

  const [stagesRes, dealsRes, companiesRes, contactsRes] = await Promise.all([
    supabase
      .from("stages")
      .select("*")
      .eq("org_id", org.id)
      .order("position", { ascending: true }),
    fetchAllRes(() =>
      supabase
        .from("deals")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false })
        .order("id")
    ),
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
  ]);

  const stages = rows(stagesRes);
  const deals = rows(dealsRes);
  const companies = rows(companiesRes);
  const contacts = rows(contactsRes);

  return (
    <DealsBoard
      stages={stages ?? []}
      deals={deals ?? []}
      companies={companies ?? []}
      contacts={(contacts ?? []).map((c) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" "),
      }))}
      canSeeAll={isAdmin}
      canManageStages={isAdmin}
      userDept={department}
    />
  );
}
