import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/data";
import { SERVICE_ROLES } from "@/lib/roles";
import { BoardAssignView } from "../board-assign-view";
import { loadBoardData } from "../board-data";

export default async function ServiceBoardsSettingsPage() {
  const { supabase, org, isAdmin } = await getSessionContext();
  if (!isAdmin) redirect("/dashboard");

  const { users, assignments } = await loadBoardData(supabase, org.id, "service");

  return (
    <BoardAssignView
      boardType="service"
      title="ตั้งค่า · Service Board"
      subtitle="มอบหมายผู้ใช้ (Dispatcher / Technical Supporter / ช่าง) ให้มีส่วนร่วมในแต่ละ Service Board"
      users={users}
      assignments={assignments}
      eligibleRoles={SERVICE_ROLES}
    />
  );
}
