import { getSessionContext, rows, fetchAllRes } from "@/lib/data";
import { ContactsView } from "./contacts-view";

export default async function ContactsPage() {
  const { supabase, org } = await getSessionContext();

  const [contactsRes, companiesRes] = await Promise.all([
    fetchAllRes(() =>
      supabase
        .from("contacts")
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
  ]);

  return (
    <ContactsView contacts={rows(contactsRes)} companies={rows(companiesRes)} />
  );
}
