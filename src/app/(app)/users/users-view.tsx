"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Trash2, UserCog, UserPlus, AlertTriangle, Dices } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useDataTable,
  DataTablePager,
  DataTableHead,
  DataTableNoMatch,
  DataTableFilterToggle,
  type ColumnDef,
} from "@/components/ui/data-table";
import { DEPARTMENTS } from "@/lib/departments";
import { USER_ROLES, isDeptScoped } from "@/lib/roles";
import { RoleMultiSelect } from "./role-multi-select";
import { displayUsername } from "@/lib/username";
import { generateTempPassword, tempPasswordProblem } from "@/lib/temp-password";
import { updateMember, createUser, resetUserPassword, removeMember } from "./actions";

type Member = {
  id: string;
  role: string;
  /** Every role this member holds. */
  app_roles: string[];
  department: string;
  name: string;
  email: string;
  /** The face they picked for themselves, if any. */
  avatarUrl: string | null;
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
  const [password, setPassword] = useState("");
  // The last account created here, so its starting password can be copied
  // and handed over — it isn't shown anywhere else afterwards.
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const [cuRoles, setCuRoles] = useState<string[]>(["Sales"]);
  const [cuDept, setCuDept] = useState<string>(DEPARTMENTS[0].value);

  const columns = useMemo<ColumnDef<Member>[]>(
    () => [
      {
        key: "user",
        header: "ผู้ใช้",
        sortAccessor: (m) => m.name || m.email,
        filter: { kind: "text", accessor: (m) => `${m.name} ${m.email}` },
      },
      {
        key: "role",
        header: "สิทธิ์ระบบ",
        sortAccessor: (m) => m.role,
        filter: { kind: "select", accessor: (m) => m.role },
      },
      {
        key: "app_roles",
        header: "บทบาท",
        sortAccessor: (m) => m.app_roles.join(", "),
        filter: {
          // Array accessor -> the row matches if ANY of its roles is picked.
          kind: "select",
          accessor: (m) => m.app_roles,
          options: USER_ROLES.map((r) => ({ value: r, label: r })),
        },
      },
      {
        key: "department",
        header: "แผนก",
        sortAccessor: (m) => m.department,
        filter: {
          kind: "select",
          accessor: (m) => m.department,
          options: DEPARTMENTS.map((d) => ({ value: d.value, label: d.label })),
        },
      },
      ...(canManage
        ? [
            {
              key: "_actions",
              header: "จัดการ",
              className: "text-right",
            } as ColumnDef<Member>,
          ]
        : []),
    ],
    [canManage]
  );
  const table = useDataTable(members, columns, {
    initialSort: { key: "user", dir: "asc" },
  });

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
      updateMember(m.id, next.app_roles ?? m.app_roles, next.department ?? m.department)
    );
  }

  function submitCreate() {
    if (!username.trim()) return;
    // Left blank → a random one. Never a shared default: anyone who knows it
    // could sign in first and claim the account.
    const pw = password || generateTempPassword();
    const problem = tempPasswordProblem(pw);
    if (problem) return alert(problem);
    const login = username.trim();
    run("create", async () => {
      const res = await createUser({
        username: login,
        fullName: name,
        password: pw,
        appRoles: cuRoles,
        department: isDeptScoped(cuRoles) ? cuDept : "",
      });
      if (res.ok) {
        setCreated({ username: login, password: pw });
        setName("");
        setUsername("");
        setPassword("");
      }
      return res;
    });
  }

  function resetPw(m: Member) {
    const pw = window.prompt(
      `ตั้งรหัสชั่วคราวใหม่ให้ ${m.name || displayUsername(m.email)}\n(ผู้ใช้จะต้องตั้งรหัสของตัวเองอีกครั้งตอนล็อกอิน — คัดลอกรหัสนี้ไปให้ผู้ใช้ก่อนกดตกลง)`,
      generateTempPassword()
    );
    if (!pw) return;
    const problem = tempPasswordProblem(pw);
    if (problem) return alert(problem);
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
              <div className="flex gap-2">
                <Input
                  placeholder="เว้นว่าง = สุ่มให้"
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  title="สุ่มรหัส"
                  aria-label="สุ่มรหัส"
                  onClick={() => setPassword(generateTempPassword())}
                >
                  <Dices className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">บทบาท</label>
              <RoleMultiSelect value={cuRoles} onChange={setCuRoles} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">แผนก</label>
              <Select value={cuDept} disabled={!isDeptScoped(cuRoles)} onChange={(e) => setCuDept(e.target.value)}>
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
          {created ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100">
              <span>
                สร้าง <b>{created.username}</b> แล้ว · รหัสเริ่มต้น{" "}
                <code className="rounded bg-white/70 px-1.5 py-0.5 font-mono dark:bg-black/30">
                  {created.password}
                </code>
              </span>
              <span className="text-xs opacity-80">
                คัดลอกไปให้ผู้ใช้ — ออกจากหน้านี้แล้วจะดูรหัสนี้ไม่ได้อีก
              </span>
              <button
                type="button"
                className="ml-auto text-xs underline"
                onClick={() => setCreated(null)}
              >
                ปิด
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Members */}
      <div>
      {members.length ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <DataTableFilterToggle table={table} />
        </div>
      ) : null}
      {members.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="ยังไม่มีผู้ใช้"
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <DataTableHead
              table={table}
              sourceRows={members}
              headClassName="uppercase tracking-wide"
            />
            <tbody>
              {table.rows.map((m) => {
                const deptRole = isDeptScoped(m.app_roles);
                const busy = pending && savingId === m.id;
                const isOwner = m.role === "owner";
                return (
                  <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={m.name || displayUsername(m.email)} src={m.avatarUrl} />
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
                      <RoleMultiSelect
                        value={m.app_roles}
                        disabled={!canManage || isOwner || busy}
                        onChange={(roles) => saveMember(m, { app_roles: roles })}
                        className="max-w-[230px]"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {isOwner || m.app_roles.includes("admin") ? (
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
              <DataTableNoMatch table={table} />
            </tbody>
          </table>
          <DataTablePager table={table} />
        </div>
      )}
      </div>

      {!canManage ? (
        <p className="text-xs text-muted-foreground">
          * เฉพาะเจ้าของ/แอดมินเท่านั้นที่จัดการผู้ใช้ได้
        </p>
      ) : null}
    </div>
  );
}
