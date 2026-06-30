import { getSessionContext } from "@/lib/data";
import { ContactsView } from "./contacts-view";

export default async function ContactsPage() {
  const { supabase, org } = await getSessionContext();

  const [{ data: contacts }, { data: companies }] = await Promise.all([
    supabase
      .from("contacts")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("companies")
      .select("id, name")
      .eq("org_id", org.id)
      .order("name"),
  ]);

  return (
    <ContactsView contacts={contacts ?? []} companies={companies ?? []} />
  );
}
