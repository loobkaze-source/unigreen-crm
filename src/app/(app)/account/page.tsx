import { getSessionContext } from "@/lib/data";
import { departmentLabel } from "@/lib/departments";
import { displayUsername } from "@/lib/username";
import { AccountView } from "./account-view";

export default async function AccountPage() {
  const { profile, email, appRoles, department, isAdmin } =
    await getSessionContext();
  return (
    <AccountView
      name={profile?.full_name || displayUsername(email) || "ผู้ใช้"}
      email={displayUsername(email)}
      appRole={isAdmin ? "admin" : appRoles.join(" · ") || "—"}
      department={isAdmin ? "ทุกแผนก" : departmentLabel(department)}
      avatarUrl={profile?.avatar_url ?? null}
    />
  );
}
