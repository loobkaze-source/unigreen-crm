import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Organization, Profile } from "@/lib/database.types";

type QueryErr = { message: string } | null;

/**
 * Unwrap a Supabase list result: throws on error (surfaced by the route's
 * error.tsx boundary) instead of silently rendering an empty page.
 */
export function rows<T>(res: { data: T[] | null; error: QueryErr }): T[] {
  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}

/** Unwrap a single-row / rpc result: throws on error, else data (may be null). */
export function row<T>(res: { data: T | null; error: QueryErr }): T | null {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

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
 *
 * Wrapped in React cache(): the layout and the page (and any actions in the
 * same request) share one resolution instead of re-querying.
 */
export const getSessionContext = cache(async (): Promise<SessionContext> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Profile and membership are independent — fetch in parallel, with the
  // organization row embedded in the membership to save a third round trip.
  const [profileRes, memberRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("organization_members")
      .select("role, app_role, department, organizations(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  // A transient failure here must NOT fall through to the workspace-creation
  // branch below, or every hiccup would mint a duplicate workspace.
  if (profileRes.error) {
    throw new Error("โหลดข้อมูลผู้ใช้ไม่สำเร็จ: " + profileRes.error.message);
  }
  if (memberRes.error) {
    throw new Error("โหลดข้อมูลผู้ใช้ไม่สำเร็จ: " + memberRes.error.message);
  }

  const profile = (profileRes.data as Profile | null) ?? null;
  const membership = memberRes.data as {
    role: string;
    app_role: string | null;
    department: string | null;
    organizations: Organization | null;
  } | null;

  let org: Organization | null = membership?.organizations ?? null;
  const role = membership?.role ?? "owner";
  const appRole = membership?.app_role ?? null;
  const department = membership?.department ?? null;

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
});
