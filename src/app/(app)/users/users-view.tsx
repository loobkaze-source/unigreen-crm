"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCog } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { USER_ROLES, updateMemberRole } from "./actions";

type Member = {
  id: string;
  role: string;
  app_role: string;
  name: string;
  email: string;
};

export function UsersView({
  members,
  canManage,
}: {
  members: Member[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);

  function changeRole(id: string, appRole: string) {
    setSavingId(id);
    startTransition(async () => {
      const res = await updateMemberRole(id, appRole);
      setSavingId(null);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <PageHeader
        title="ผู้ใช้และบทบาท"
        subtitle="สมาชิกในพื้นที่ทำงานและบทบาทการใช้งาน"
      />

      {members.length === 0 ? (
        <EmptyState icon={UserCog} title="ยังไม่มีผู้ใช้" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">ผู้ใช้</th>
                <th className="px-4 py-3 font-medium">สิทธิ์ระบบ</th>
                <th className="px-4 py-3 font-medium">บทบาท</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name || m.email} />
                      <div>
                        <div className="font-medium">{m.name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={m.role === "owner" || m.role === "admin" ? "primary" : "muted"}>
                      {m.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={m.app_role}
                      disabled={!canManage || (pending && savingId === m.id)}
                      onChange={(e) => changeRole(m.id, e.target.value)}
                      className="max-w-[200px]"
                    >
                      <option value="">— ยังไม่กำหนด —</option>
                      {USER_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!canManage ? (
        <p className="mt-3 text-xs text-muted-foreground">
          * เฉพาะเจ้าของ/แอดมินเท่านั้นที่แก้ไขบทบาทได้
        </p>
      ) : null}
    </div>
  );
}
