import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Organization, Profile } from "@/lib/database.types";

export type SessionContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  email: string | null;
  profile: Profile | null;
  org: Organization;
  role: string;
  /** Business role assigned by an admin (admin/Sales/Manager/…). */
  appRole: string | null;
  /** Department the user is scoped to (null = all / admin). */
  department: string | null;
  /** true when the user may see every department's data. */
  isAdmin: boolean;
  /** true when the user must set a new password before using the app. */
  mustChangePassword: boolean;
};

/**
 * Resolves the authenticated user and their active organization for use in
 * Server Components, Route Handlers and Server Actions. Redirects to /login
 * when unauthenticated. Self-heals by creating a workspace if a user somehow
 * has no organization yet.
 */
export async function getSessionContext(): Promise<SessionContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("org_id, role, app_role, department")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  let org: Organization | null = null;
  let role = "owner";
  let appRole: string | null = null;
  let department: string | null = null;

  if (memberships && memberships.length > 0) {
    role = memberships[0].role;
    appRole = (memberships[0].app_role as string) ?? null;
    department = (memberships[0].department as string) ?? null;
    const { data } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", memberships[0].org_id)
      .maybeSingle();
    org = data;
  }

  if (!org) {
    const workspaceName =
      (profile?.full_name || user.email?.split("@")[0] || "My") + "'s Workspace";
    const { data: created } = await supabase
      .from("organizations")
      .insert({ name: workspaceName })
      .select("*")
      .single();
    org = created;
  }

  if (!org) {
    // Should never happen once the DB triggers are installed.
    redirect("/setup");
  }

  const isAdmin =
    role === "owner" || role === "admin" || appRole === "admin";

  return {
    supabase,
    userId: user.id,
    email: user.email ?? null,
    profile: profile ?? null,
    org,
    role,
    appRole,
    department,
    isAdmin,
    mustChangePassword: Boolean(
      (profile as { must_change_password?: boolean } | null)?.must_change_password
    ),
  };
}
