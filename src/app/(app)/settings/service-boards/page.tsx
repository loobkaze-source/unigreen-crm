import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/data";
import { SERVICE_ROLES } from "@/lib/roles";
import { BoardAssignView, type OrgUser } from "../board-assign-view";

export default async function ServiceBoardsSettingsPage() {
  const { supabase, org, isAdmin } = await getSessionContext();
  if (!isAdmin) redirect("/dashboard");

  const [{ data: members }, { data: assignments }] = await Promise.all([
    supabase.from("organization_members").select("user_id, app_role").eq("org_id", org.id),
    supabase
      .from("board_assignments")
      .select("id, board_key, user_id")
      .eq("org_id", org.id)
      .eq("board_type", "service"),
  ]);

  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
    : { data: [] };
  const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const users: OrgUser[] = (members ?? []).map((m) => ({
    user_id: m.user_id as string,
    app_role: (m.app_role as string) || "",
    name: pmap.get(m.user_id)?.full_name || "",
    email: pmap.get(m.user_id)?.email || "",
  }));

  return (
    <BoardAssignView
      boardType="service"
      title="ตั้งค่า · Service Board"
      subtitle="มอบหมายผู้ใช้ (Dispatcher / Technical Supporter / ช่าง) ให้มีส่วนร่วมในแต่ละ Service Board"
      users={users}
      assignments={assignments ?? []}
      eligibleRoles={SERVICE_ROLES}
    />
  );
}
