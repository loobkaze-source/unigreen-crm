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

  const { profile, email, org } = await getSessionContext();

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
