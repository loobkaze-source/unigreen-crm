import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionContext } from "@/lib/data";
import { displayUsername } from "@/lib/username";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) redirect("/setup");

  const { profile, email, org, appRole, isAdmin, mustChangePassword } =
    await getSessionContext();

  // Force a password change before any app page is reachable.
  if (mustChangePassword) redirect("/set-password");

  return (
    <AppShell
      user={{
        name: profile?.full_name || displayUsername(email) || "User",
        email: displayUsername(email),
      }}
      orgName={org.name}
      appRole={appRole}
      isAdmin={isAdmin}
    >
      {children}
    </AppShell>
  );
}
