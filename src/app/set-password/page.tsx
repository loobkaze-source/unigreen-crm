import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/data";
import { SetPasswordForm } from "./set-password-form";

export default async function SetPasswordPage() {
  const { email, mustChangePassword } = await getSessionContext();
  // Already good — don't trap the user here.
  if (!mustChangePassword) redirect("/dashboard");
  return <SetPasswordForm email={email || ""} />;
}
