import { getSessionContext, rows as unwrap } from "@/lib/data";
import { isAdminKeyConfigured } from "@/lib/supabase/admin";
import { UsersView } from "./users-view";

export default async function UsersPage() {
  const { supabase, org, isAdmin } = await getSessionContext();

  // Two steps by necessity: organization_members has no FK to profiles (both
  // point at auth.users), so PostgREST cannot embed one in the other.
  const members = unwrap(
    await supabase
      .from("organization_members")
      .select("id, user_id, role, app_role, app_roles, department, created_at")
      .eq("org_id", org.id)
      .order("created_at", { ascending: true })
  );

  const ids = members.map((m) => m.user_id);
  const profiles = ids.length
    ? unwrap(
        await supabase
          .from("profiles")
          .select("id, full_name, email, avatar_url")
          .in("id", ids)
      )
    : [];

  const pmap = new Map(profiles.map((p) => [p.id, p]));

  const rows = members.map((m) => ({
    id: m.id,
    role: m.role as string,
    // app_roles is the source of truth; app_role is only the mirrored primary.
    app_roles: (m.app_roles as string[] | null)?.length
      ? (m.app_roles as string[])
      : m.app_role
        ? [m.app_role as string]
        : [],
    department: (m.department as string) || "",
    name: pmap.get(m.user_id)?.full_name || "",
    email: pmap.get(m.user_id)?.email || "",
    avatarUrl: (pmap.get(m.user_id)?.avatar_url as string | null) ?? null,
  }));

  return (
    <UsersView members={rows} canManage={isAdmin} keyReady={isAdminKeyConfigured()} />
  );
}
