"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Trash2, UserCog, UserPlus, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { DEPARTMENTS } from "@/lib/departments";
import { USER_ROLES, DEPT_ROLES } from "@/lib/roles";
import { displayUsername } from "@/lib/username";
import { updateMember, createUser, resetUserPassword, removeMember } from "./actions";

type Member = {
  id: string;
  role: string;
  app_role: string;
  department: string;
  name: string;
  email: string;
};

export function UsersView({
  members,
  canManage,
  keyReady,
}: {
  members: Member[];
  canManage: boolean;
  keyReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);

  // create-user form
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("123456");
  const [cuRole, setCuRole] = useState("Sales");
  const [cuDept, setCuDept] = useState<string>(DEPARTMENTS[0].value);

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
    run(m.id, () =>
      updateMember(m.id, next.app_role ?? m.app_role, next.department ?? m.department)
    );
  }

  function submitCreate() {
    if (!username.trim()) return;
    run("create", async () => {
      const res = await createUser({
        username,
        fullName: name,
        password,
        appRole: cuRole,
        department: DEPT_ROLES.has(cuRole) ? cuDept : "",
      });
      if (res.ok) {
        setName("");
        setUsername("");
        setPassword("123456");
      }
      return res;
    });
  }

  function resetPw(m: Member) {
    const pw = window.prompt(
      `ตั้งรหัสชั่วคราวใหม่ให้ ${m.name || displayUsername(m.email)}\n(ผู้ใช้จะต้องตั้งรหัสของตัวเองอีกครั้งตอนล็อกอิน)`,
      "123456"
    );
    if (!pw) return;
    if (pw.length < 6) return alert("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
    run(m.id, () => resetUserPassword(m.id, pw));
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="ผู้ใช้และบทบาท"
        subtitle="แอดมินสร้างผู้ใช้ กำหนดบทบาท/แผนก และรีเซ็ตรหัสผ่านได้ที่นี่"
      />

      {canManage && !keyReady ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            ยังสร้าง/รีเซ็ตรหัสผู้ใช้ไม่ได้ — ต้องตั้งค่า{" "}
            <code className="rounded bg-amber-100 px-1">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
            ใน Netlify (Environment variables) และ <code className="rounded bg-amber-100 px-1">.env.local</code> ก่อน
          </div>
        </div>
      ) : null}

      {/* Create user */}
      {canManage ? (
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <UserPlus className="h-4 w-4 text-primary" /> เพิ่มผู้ใช้ใหม่
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">ชื่อ-นามสกุล</label>
              <Input placeholder="สมชาย ใจดี" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">ชื่อผู้ใช้ (ใช้ล็อกอิน)</label>
              <Input
                type="text"
                placeholder="เช่น somchai"
                autoCapitalize="none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">รหัสผ่านเริ่มต้น</label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">บทบาท</label>
              <Select value={cuRole} onChange={(e) => setCuRole(e.target.value)}>
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">แผนก</label>
              <Select value={cuDept} disabled={!DEPT_ROLES.has(cuRole)} onChange={(e) => setCuDept(e.target.value)}>
                {DEPARTMENTS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={submitCreate} disabled={!keyReady || (pending && savingId === "create")}>
                {pending && savingId === "create" ? "กำลังสร้าง…" : "สร้างผู้ใช้"}
              </Button>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            ผู้ใช้ล็อกอินด้วยชื่อผู้ใช้ + รหัสเริ่มต้นนี้ (ไม่ต้องมีอีเมล) แล้วระบบจะบังคับให้ตั้งรหัสของตัวเองก่อนใช้งาน
          </p>
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
                {canManage ? <th className="px-4 py-3 text-right font-medium">จัดการ</th> : null}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const deptRole = DEPT_ROLES.has(m.app_role);
                const busy = pending && savingId === m.id;
                const isOwner = m.role === "owner";
                return (
                  <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={m.name || displayUsername(m.email)} />
                        <div>
                          <div className="font-medium">{m.name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{displayUsername(m.email)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={isOwner || m.role === "admin" ? "primary" : "muted"}>{m.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={m.app_role}
                        disabled={!canManage || isOwner || busy}
                        onChange={(e) => saveMember(m, { app_role: e.target.value })}
                        className="max-w-[170px]"
                      >
                        <option value="">— ยังไม่กำหนด —</option>
                        {USER_ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      {isOwner || m.app_role === "admin" ? (
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
                            <option key={d.value} value={d.value}>{d.label}</option>
                          ))}
                        </Select>
                      )}
                    </td>
                    {canManage ? (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {!isOwner ? (
                            <>
                              <button
                                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary disabled:opacity-40"
                                title="รีเซ็ตรหัสผ่าน"
                                disabled={!keyReady || busy}
                                onClick={() => resetPw(m)}
                              >
                                <KeyRound className="h-4 w-4" />
                              </button>
                              <button
                                className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                title="นำออกจากพื้นที่ทำงาน"
                                disabled={busy}
                                onClick={() => {
                                  if (confirm(`นำ ${m.name || displayUsername(m.email)} ออกจากพื้นที่ทำงาน?`))
                                    run(m.id, () => removeMember(m.id));
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          ) : null}
                        </div>
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
          * เฉพาะเจ้าของ/แอดมินเท่านั้นที่จัดการผู้ใช้ได้
        </p>
      ) : null}
    </div>
  );
}
