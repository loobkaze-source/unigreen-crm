import { getSessionContext, rows, fetchAllRes } from "@/lib/data";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { CASE_ROLES, hasRole } from "@/lib/roles";
import { CasesView } from "./cases-view";

const CASES_PAGE_LIMIT = 200;

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { supabase, org, isAdmin, appRoles } = await getSessionContext();
  const search = ((await searchParams).q ?? "").trim();
  const canManage = isAdmin || hasRole(appRoles, ...CASE_ROLES);

  // Attachments and linked assets ride along embedded — they used to be a
  // second wave of .in(...200 ids) queries serialized behind this one.
  let casesQuery = supabase
    .from("cases")
    .select(
      "*, case_attachments(id, path, name, mime, created_at), case_assets(equipment_id, condition)"
    )
    .eq("org_id", org.id)
    .order("case_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(CASES_PAGE_LIMIT);
  if (search) {
    const term = search.replace(/[%_]/g, "\\$&").replace(/[,()]/g, " ").trim();
    const ors = [
      `code.ilike.%${term}%`,
      `subject.ilike.%${term}%`,
      `employee.ilike.%${term}%`,
      `note.ilike.%${term}%`,
      // The number the customer quotes is the one they search by.
      `customer_wo_ref.ilike.%${term}%`,
    ];
    const digits = search.replace(/\D/g, "");
    if (digits) ors.push(`number.eq.${Number(digits)}`);
    casesQuery = casesQuery.or(ors.join(","));
  }

  const [casesRes, companiesRes, contactsRes, sitesRes, assetsRes, membersRes] =
    await Promise.all([
      casesQuery,
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
          .select("id, first_name, last_name, company_id")
          .eq("org_id", org.id)
          .order("first_name")
          .order("id")
      ),
      fetchAllRes(() =>
        supabase
          .from("sites")
          .select("id, name, company_id")
          .eq("org_id", org.id)
          .order("name")
          .order("id")
      ),
      fetchAllRes(() =>
        supabase
          .from("equipment")
          .select("id, name, site_id, status, code, serial_number")
          .eq("org_id", org.id)
          .neq("status", "retired")
          .order("code")
          .order("id")
      ),
      supabase
        .from("organization_members")
        .select("user_id, app_roles")
        .eq("org_id", org.id),
    ]);

  const cases = rows(casesRes);
  const companies = rows(companiesRes);
  const contacts = rows(contactsRes);
  const sites = rows(sitesRes);
  const assets = rows(assetsRes);
  const members = rows(membersRes);

  // Who can be named on a case (user_id -> profile name), plus attachments for
  // the listed cases. A member holds a set of roles, so ask whether the role is
  // in it rather than whether it is the one.
  const holding = (role: string) =>
    members
      .filter((m) => ((m.app_roles as string[]) ?? []).includes(role))
      .map((m) => m.user_id as string);
  const supporterIds = holding("Technical Supporter");
  const dispatcherIds = holding("Dispatcher");
  const namedIds = [...new Set([...supporterIds, ...dispatcherIds])];
  // The one remaining dependent query: profiles keyed by the member ids
  // (no FK from organization_members to profiles, so no embed).
  const profilesRes = namedIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", namedIds)
    : { data: [], error: null };
  if (profilesRes.error) throw new Error(profilesRes.error.message);

  const nameOf = new Map(
    (profilesRes.data ?? []).map((p) => [
      p.id as string,
      (p.full_name as string) || (p.email as string) || "—",
    ])
  );
  const asOptions = (ids: string[]) =>
    ids.map((id) => ({ id, name: nameOf.get(id) ?? "—" })).sort((a, b) => a.name.localeCompare(b.name, "th"));
  const supporters = asOptions(supporterIds);
  const dispatchers = asOptions(dispatcherIds);

  type EmbeddedAttachment = {
    id: string;
    path: string;
    name: string | null;
    mime: string | null;
    created_at: string;
  };
  type EmbeddedCaseAsset = {
    equipment_id: string;
    condition: "operational" | "degraded" | "down" | null;
  };
  const attachments = cases
    .flatMap((c) =>
      (((c as { case_attachments?: EmbeddedAttachment[] }).case_attachments ?? []).map(
        (a) => ({ ...a, case_id: c.id as string })
      ))
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((a) => ({
      id: a.id,
      case_id: a.case_id,
      path: a.path,
      name: a.name || "ไฟล์แนบ",
      mime: a.mime || "",
      url: `${SUPABASE_URL}/storage/v1/object/public/case-files/${a.path}`,
    }));
  const caseAssets = cases.flatMap((c) =>
    (((c as { case_assets?: EmbeddedCaseAsset[] }).case_assets ?? []).map((r) => ({
      case_id: c.id as string,
      equipment_id: r.equipment_id,
      condition: r.condition ?? null,
    })))
  );

  return (
    <CasesView
      cases={cases}
      initialQuery={search}
      limitHit={(cases ?? []).length === CASES_PAGE_LIMIT}
      companies={companies ?? []}
      contacts={(contacts ?? []).map((c) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" "),
        company_id: (c.company_id as string) ?? null,
      }))}
      sites={sites}
      assets={assets.map((a) => ({
        id: a.id as string,
        name: `${a.name}${a.serial_number ? ` · ${a.serial_number}` : ""}`,
        site_id: (a.site_id as string) ?? null,
        status: (a.status as string) ?? "operational",
      }))}
      caseAssets={caseAssets}
      supporters={supporters}
      dispatchers={dispatchers}
      attachments={attachments}
      canManage={canManage}
      orgId={org.id}
    />
  );
}
