import { getSessionContext } from "@/lib/data";
import { isAdminKeyConfigured } from "@/lib/supabase/admin";
import { UsersView } from "./users-view";

export default async function UsersPage() {
  const { supabase, org, isAdmin } = await getSessionContext();

  const { data: members } = await supabase
    .from("organization_members")
    .select("id, user_id, role, app_role, department, created_at")
    .eq("org_id", org.id)
    .order("created_at", { ascending: true });

  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
    : { data: [] };

  const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const rows = (members ?? []).map((m) => ({
    id: m.id,
    role: m.role as string,
    app_role: (m.app_role as string) || "",
    department: (m.department as string) || "",
    name: pmap.get(m.user_id)?.full_name || "",
    email: pmap.get(m.user_id)?.email || "",
  }));

  return (
    <UsersView members={rows} canManage={isAdmin} keyReady={isAdminKeyConfigured()} />
  );
}
