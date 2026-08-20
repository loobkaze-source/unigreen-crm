import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/data";
import { PIPELINE_ROLES } from "@/lib/roles";
import { BoardAssignView } from "../board-assign-view";
import { loadBoardData } from "../board-data";

export default async function PipelinesSettingsPage() {
  const { supabase, org, isAdmin } = await getSessionContext();
  if (!isAdmin) redirect("/dashboard");

  const { users, assignments } = await loadBoardData(supabase, org.id, "pipeline");

  return (
    <BoardAssignView
      boardType="pipeline"
      title="ตั้งค่า · ไปป์ไลน์"
      subtitle="มอบหมายผู้ใช้ (Sales / Manager) ให้มีส่วนร่วมในแต่ละไปป์ไลน์การขาย"
      users={users}
      assignments={assignments}
      eligibleRoles={PIPELINE_ROLES}
    />
  );
}
