"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Trash2, UserCog, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { DEPARTMENTS, departmentLabel } from "@/lib/departments";
import {
  USER_ROLES,
  updateMember,
  inviteMember,
  revokeInvite,
  removeMember,
} from "./actions";

type Member = {
  id: string;
  role: string;
  app_role: string;
  department: string;
  name: string;
  email: string;
};

type Invite = {
  id: string;
  email: string;
  app_role: string;
  department: string;
};

/** Roles that are pinned to a single department. */
const DEPT_ROLES = new Set(["Manager", "Sales", "Job Dispatcher", "Technician"]);

export function UsersView({
  members,
  invites,
  canManage,
}: {
  members: Member[];
  invites: Invite[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);

  // invite form
  const [email, setEmail] = useState("");
  const [invRole, setInvRole] = useState("Sales");
  const [invDept, setInvDept] = useState<string>(DEPARTMENTS[0].value);

  function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setSavingId(id);
    startTransition(async () => {
      const res = await fn();
      setSavingId(null);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  function saveMember(m: Member, next: Partial<Member>) {
    const appRole = next.app_role ?? m.app_role;
    const department = next.department ?? m.department;
    run(m.id, () => updateMember(m.id, appRole, department));
  }

  function submitInvite() {
    if (!email.trim()) return;
    run("invite", async () => {
      const res = await inviteMember({
        email,
        appRole: invRole,
        department: DEPT_ROLES.has(invRole) ? invDept : "",
      });
      if (res.ok) setEmail("");
      return res;
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="ผู้ใช้และบทบาท"
        subtitle="สมาชิกในพื้นที่ทำงาน · แอดมินกำหนดบทบาทและแผนกให้แต่ละคน"
      />

      {/* Invite */}
      {canManage ? (
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <UserPlus className="h-4 w-4 text-primary" />
            เชิญสมาชิกเข้าพื้นที่ทำงาน
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">อีเมล</label>
              <Input
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-44">
              <label className="mb-1 block text-xs text-muted-foreground">บทบาท</label>
              <Select value={invRole} onChange={(e) => setInvRole(e.target.value)}>
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full sm:w-44">
              <label className="mb-1 block text-xs text-muted-foreground">แผนก</label>
              <Select
                value={invDept}
                disabled={!DEPT_ROLES.has(invRole)}
                onChange={(e) => setInvDept(e.target.value)}
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              onClick={submitInvite}
              disabled={pending && savingId === "invite"}
            >
              เชิญ
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            ถ้าอีเมลยังไม่มีบัญชี ระบบจะเพิ่มให้อัตโนมัติเมื่อผู้ใช้สมัคร/เข้าสู่ระบบด้วยอีเมลนี้
          </p>

          {invites.length > 0 ? (
            <div className="mt-4 space-y-1.5 border-t border-border pt-3">
              <div className="text-xs font-medium text-muted-foreground">
                คำเชิญที่รอดำเนินการ ({invites.length})
              </div>
              {invites.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm"
                >
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{i.email}</span>
                  <Badge tone="muted">{i.app_role || "—"}</Badge>
                  {i.department ? (
                    <Badge tone="primary">{departmentLabel(i.department)}</Badge>
                  ) : null}
                  <button
                    className="ml-auto rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="ยกเลิกคำเชิญ"
                    disabled={pending && savingId === i.id}
                    onClick={() => run(i.id, () => revokeInvite(i.id))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Members */}
      {members.length === 0 ? (
        <EmptyState icon={UserCog} title="ยังไม่มีผู้ใช้" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">ผู้ใช้</th>
                <th className="px-4 py-3 font-medium">สิทธิ์ระบบ</th>
                <th className="px-4 py-3 font-medium">บทบาท</th>
                <th className="px-4 py-3 font-medium">แผนก</th>
                {canManage ? <th className="px-4 py-3" /> : null}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const deptRole = DEPT_ROLES.has(m.app_role);
                const busy = pending && savingId === m.id;
                return (
                  <tr
                    key={m.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
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
                        disabled={!canManage || m.role === "owner" || busy}
                        onChange={(e) => saveMember(m, { app_role: e.target.value })}
                        className="max-w-[170px]"
                      >
                        <option value="">— ยังไม่กำหนด —</option>
                        {USER_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      {m.role === "owner" || m.app_role === "admin" ? (
                        <span className="text-xs text-muted-foreground">ทุกแผนก</span>
                      ) : (
                        <Select
                          value={m.department}
                          disabled={!canManage || !deptRole || busy}
                          onChange={(e) => saveMember(m, { department: e.target.value })}
                          className="max-w-[170px]"
                        >
                          <option value="">— ทุกแผนก —</option>
                          {DEPARTMENTS.map((d) => (
                            <option key={d.value} value={d.value}>
                              {d.label}
                            </option>
                          ))}
                        </Select>
                      )}
                    </td>
                    {canManage ? (
                      <td className="px-4 py-3 text-right">
                        {m.role !== "owner" ? (
                          <button
                            className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="นำออกจากพื้นที่ทำงาน"
                            disabled={busy}
                            onClick={() => {
                              if (confirm(`นำ ${m.name || m.email} ออกจากพื้นที่ทำงาน?`))
                                run(m.id, () => removeMember(m.id));
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!canManage ? (
        <p className="text-xs text-muted-foreground">
          * เฉพาะเจ้าของ/แอดมินเท่านั้นที่แก้ไขบทบาทและแผนกได้
        </p>
      ) : null}
    </div>
  );
}
