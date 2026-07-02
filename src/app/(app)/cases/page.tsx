import { getSessionContext, rows } from "@/lib/data";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { CASE_ROLES } from "@/lib/roles";
import { CasesView } from "./cases-view";

const CASES_PAGE_LIMIT = 200;

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { supabase, org, isAdmin, appRole } = await getSessionContext();
  const search = ((await searchParams).q ?? "").trim();
  const canManage =
    isAdmin || CASE_ROLES.includes(appRole as (typeof CASE_ROLES)[number]);

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

  const [casesRes, companiesRes, contactsRes, sitesRes, membersRes] =
    await Promise.all([
      casesQuery,
      supabase.from("companies").select("id, name").eq("org_id", org.id).order("name")
        .limit(500),
      supabase
        .from("contacts")
        .select("id, first_name, last_name")
        .eq("org_id", org.id)
        .order("first_name")
        .limit(500),
      supabase
        .from("sites")
        .select("id, name, company_id")
        .eq("org_id", org.id)
        .order("name")
        .limit(500),
      supabase
        .from("organization_members")
        .select("user_id, app_role")
        .eq("org_id", org.id)
        .eq("app_role", "Technical Supporter"),
    ]);

  const cases = rows(casesRes);
  const companies = rows(companiesRes);
  const contacts = rows(contactsRes);
  const sites = rows(sitesRes);
  const members = rows(membersRes);

  // Technical Supporter options (user_id -> profile name) + attachments for
  // the listed cases.
  const supporterIds = members.map((m) => m.user_id as string);
  const caseIds = cases.map((c) => c.id as string);
  const [profilesRes, attachmentsRes] = await Promise.all([
    supporterIds.length
      ? supabase.from("profiles").select("id, full_name, email").in("id", supporterIds)
      : Promise.resolve({ data: [], error: null }),
    caseIds.length
      ? supabase
          .from("case_attachments")
          .select("id, case_id, path, name, mime")
          .in("case_id", caseIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const supporters = (profilesRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: (p.full_name as string) || (p.email as string) || "—",
  }));
  const attachments = (attachmentsRes.data ?? []).map((a) => ({
    id: a.id as string,
    case_id: a.case_id as string,
    path: a.path as string,
    name: (a.name as string) || "ไฟล์แนบ",
    mime: (a.mime as string) || "",
    url: `${SUPABASE_URL}/storage/v1/object/public/case-files/${a.path}`,
  }));

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
      sites={sites}
      supporters={supporters}
      attachments={attachments}
      canManage={canManage}
      orgId={org.id}
    />
  );
}
