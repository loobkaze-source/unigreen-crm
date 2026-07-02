import { getSessionContext, rows } from "@/lib/data";
import { CasesView } from "./cases-view";

const CASES_PAGE_LIMIT = 200;

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { supabase, org } = await getSessionContext();
  const search = ((await searchParams).q ?? "").trim();

  let casesQuery = supabase
    .from("cases")
    .select("*")
    .eq("org_id", org.id)
    .order("case_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(CASES_PAGE_LIMIT);
  if (search) {
    const term = search.replace(/[%_]/g, "\\$&").replace(/[,()]/g, " ").trim();
    const ors = [
      `subject.ilike.%${term}%`,
      `employee.ilike.%${term}%`,
      `note.ilike.%${term}%`,
    ];
    const digits = search.replace(/\D/g, "");
    if (digits) ors.push(`number.eq.${Number(digits)}`);
    casesQuery = casesQuery.or(ors.join(","));
  }

  const [casesRes, companiesRes, contactsRes] =
    await Promise.all([
      casesQuery,
      supabase.from("companies").select("id, name").eq("org_id", org.id).order("name"),
      supabase
        .from("contacts")
        .select("id, first_name, last_name")
        .eq("org_id", org.id)
        .order("first_name"),
    ]);

  const cases = rows(casesRes);
  const companies = rows(companiesRes);
  const contacts = rows(contactsRes);

  return (
    <CasesView
      cases={cases}
      initialQuery={search}
      limitHit={(cases ?? []).length === CASES_PAGE_LIMIT}
      companies={companies ?? []}
      contacts={(contacts ?? []).map((c) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" "),
      }))}
    />
  );
}
