import { rows } from "@/lib/data";
import type { SessionContext } from "@/lib/data";
import type { OrgUser } from "./board-assign-view";

export type BoardAssignment = { id: string; board_key: string; user_id: string };

/**
 * The org's users (with their role sets) and one board type's assignments —
 * shared by the pipelines and service-boards settings pages, which are the
 * same page pointed at a different board list.
 */
export async function loadBoardData(
  supabase: SessionContext["supabase"],
  orgId: string,
  boardType: "pipeline" | "service"
): Promise<{ users: OrgUser[]; assignments: BoardAssignment[] }> {
  const [membersRes, assignmentsRes] = await Promise.all([
    supabase
      .from("organization_members")
      .select("user_id, app_role, app_roles")
      .eq("org_id", orgId),
    supabase
      .from("board_assignments")
      .select("id, board_key, user_id")
      .eq("org_id", orgId)
      .eq("board_type", boardType),
  ]);
  const members = rows(membersRes);
  const assignments = rows<BoardAssignment>(assignmentsRes as never);

  // Two steps by necessity: organization_members has no FK to profiles.
  const ids = members.map((m) => m.user_id);
  const profiles = ids.length
    ? rows(
        await supabase.from("profiles").select("id, full_name, email").in("id", ids)
      )
    : [];
  const pmap = new Map(profiles.map((p) => [p.id, p]));

  const users: OrgUser[] = members.map((m) => ({
    user_id: m.user_id as string,
    app_roles: (m.app_roles as string[] | null)?.length
      ? (m.app_roles as string[])
      : m.app_role
        ? [m.app_role as string]
        : [],
    name: pmap.get(m.user_id)?.full_name || "",
    email: pmap.get(m.user_id)?.email || "",
  }));

  return { users, assignments };
}
