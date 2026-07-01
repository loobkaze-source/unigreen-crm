import { getSessionContext } from "@/lib/data";
import { departmentLabel } from "@/lib/departments";
import { AccountView } from "./account-view";

export default async function AccountPage() {
  const { profile, email, appRole, department, isAdmin } =
    await getSessionContext();
  return (
    <AccountView
      name={profile?.full_name || email?.split("@")[0] || "ผู้ใช้"}
      email={email || ""}
      appRole={isAdmin ? "admin" : appRole || "—"}
      department={isAdmin ? "ทุกแผนก" : departmentLabel(department)}
    />
  );
}
