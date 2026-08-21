import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSessionContext, row, rows } from "@/lib/data";
import { SUPABASE_URL } from "@/lib/supabase/env";
import type { Case, CaseStatus } from "@/lib/database.types";
import { CASE_ROLES, hasRole } from "@/lib/roles";
import { CaseDetail } from "./case-detail";

type Named = { name: string } | null;
type CaseRow = Case & {
  companies: Named;
  sites: { id: string; name: string } | null;
  contacts: { first_name: string; last_name: string | null; phone: string | null } | null;
  case_assets: {
    condition: "operational" | "degraded" | "down" | null;
    equipment: { id: string; name: string; serial_number: string | null; status: string } | null;
  }[];
  case_attachments: {
    id: string;
    path: string;
    name: string | null;
    mime: string | null;
    created_at: string;
  }[];
};

type WoRow = {
  id: string;
  number: number | null;
  report_no: string | null;
  title: string;
  status: string;
  job_class: string | null;
  scheduled_start: string | null;
  completed_at: string | null;
  technicians: { name: string; nickname: string | null } | null;
  work_order_technicians: { technicians: { name: string; nickname: string | null } | null }[];
};

/** One fetch per request, shared by generateMetadata and the page. */
const loadCase = cache(async (id: string) => {
  const { supabase, org } = await getSessionContext();
  return row<CaseRow>(
    (await supabase
      .from("cases")
      .select(
        "*, companies(name), sites(id, name), contacts(first_name, last_name, phone), " +
          "case_assets(condition, equipment(id, name, serial_number, status)), " +
          "case_attachments(id, path, name, mime, created_at)"
      )
      .eq("id", id)
      .eq("org_id", org.id)
      .maybeSingle()) as never
  );
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const c = await loadCase(id);
  return { title: c ? (c.code ?? c.subject) : "เคส" };
}

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getSessionContext();
  const { supabase, org, isAdmin, appRoles } = ctx;
  const canManage = isAdmin || hasRole(appRoles, ...CASE_ROLES);

  const caseRow = await loadCase(id);
  if (!caseRow) notFound();

  // The case's jobs and the org's member roster don't depend on each other.
  const [wosRes, membersRes] = await Promise.all([
    supabase
      .from("work_orders")
      .select(
        "id, number, report_no, title, status, job_class, scheduled_start, completed_at, " +
          "technicians(name, nickname), work_order_technicians(technicians(name, nickname))"
      )
      .eq("org_id", org.id)
      .eq("case_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("organization_members")
      .select("user_id, app_roles")
      .eq("org_id", org.id),
  ]);
  const workOrders = rows<WoRow>(wosRes as never);
  const members = rows(membersRes);

  // Names for everyone the case can point at: role holders (for the pickers)
  // plus whoever opened it. No FK from members to profiles, so a second step.
  const holding = (role: string) =>
    members
      .filter((m) => ((m.app_roles as string[]) ?? []).includes(role))
      .map((m) => m.user_id as string);
  const supporterIds = holding("Technical Supporter");
  const dispatcherIds = holding("Dispatcher");
  const profileIds = [
    ...new Set(
      [...supporterIds, ...dispatcherIds, caseRow.owner_id, caseRow.supporter_id].filter(
        Boolean
      ) as string[]
    ),
  ];
  const profiles = profileIds.length
    ? rows(
        await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", profileIds)
      )
    : [];
  const nameOf = new Map(
    profiles.map((p) => [
      p.id as string,
      (p.full_name as string) || (p.email as string) || "—",
    ])
  );
  const asOptions = (ids: string[]) =>
    ids
      .map((uid) => ({ id: uid, name: nameOf.get(uid) ?? "—" }))
      .sort((a, b) => a.name.localeCompare(b.name, "th"));

  const contactName = caseRow.contacts
    ? [caseRow.contacts.first_name, caseRow.contacts.last_name].filter(Boolean).join(" ")
    : null;

  return (
    <CaseDetail
      caseRow={caseRow}
      companyName={caseRow.companies?.name ?? null}
      site={caseRow.sites}
      contact={
        caseRow.contacts
          ? { name: contactName ?? "—", phone: caseRow.contacts.phone }
          : null
      }
      caseAssets={caseRow.case_assets
        .filter((a) => a.equipment)
        .map((a) => ({
          id: a.equipment!.id,
          name: a.equipment!.name,
          serial: a.equipment!.serial_number,
          status: a.equipment!.status,
          condition: a.condition,
        }))}
      attachments={[...caseRow.case_attachments]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((a) => ({
          id: a.id,
          name: a.name || "ไฟล์แนบ",
          mime: a.mime || "",
          url: `${SUPABASE_URL}/storage/v1/object/public/case-files/${a.path}`,
        }))}
      workOrders={workOrders.map((w) => ({
        id: w.id,
        number: w.number,
        report_no: w.report_no,
        title: w.title,
        status: w.status,
        job_class: w.job_class,
        scheduled_start: w.scheduled_start,
        completed_at: w.completed_at,
        technicianName: w.technicians
          ? w.technicians.nickname || w.technicians.name
          : null,
        crewNames: w.work_order_technicians
          .map((t) => (t.technicians ? t.technicians.nickname || t.technicians.name : null))
          .filter((n): n is string => Boolean(n)),
      }))}
      ownerName={caseRow.owner_id ? (nameOf.get(caseRow.owner_id) ?? null) : null}
      supporterName={
        caseRow.supporter_id ? (nameOf.get(caseRow.supporter_id) ?? null) : null
      }
      supporters={asOptions(supporterIds)}
      dispatchers={asOptions(dispatcherIds)}
      canManage={canManage}
      orgId={org.id}
      status={caseRow.status as CaseStatus}
    />
  );
}
