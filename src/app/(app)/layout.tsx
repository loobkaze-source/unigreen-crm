import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionContext } from "@/lib/data";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) redirect("/setup");

  const { profile, email, org, mustChangePassword } = await getSessionContext();

  // Force a password change before any app page is reachable.
  if (mustChangePassword) redirect("/set-password");

  return (
    <AppShell
      user={{
        name: profile?.full_name || email?.split("@")[0] || "User",
        email: email || "",
      }}
      orgName={org.name}
    >
      {children}
    </AppShell>
  );
}
