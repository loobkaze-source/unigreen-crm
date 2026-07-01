"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { DEPARTMENTS } from "@/lib/departments";
import { assignToBoard, unassignFromBoard } from "./actions";

export type OrgUser = {
  user_id: string;
  name: string;
  email: string;
  app_role: string;
};
export type Assignment = { id: string; board_key: string; user_id: string };

export function BoardAssignView({
  boardType,
  title,
  subtitle,
  users,
  assignments,
  eligibleRoles,
}: {
  boardType: "pipeline" | "service";
  title: string;
  subtitle: string;
  users: OrgUser[];
  assignments: Assignment[];
  eligibleRoles: readonly string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const eligible = users.filter((u) => eligibleRoles.includes(u.app_role));
  const userById = new Map(users.map((u) => [u.user_id, u]));

  function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusyKey(key);
    startTransition(async () => {
      const res = await fn();
      setBusyKey(null);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />

      <div className="grid gap-4 lg:grid-cols-3">
        {DEPARTMENTS.map((dept) => {
          const rows = assignments.filter((a) => a.board_key === dept.value);
          const assignedIds = new Set(rows.map((r) => r.user_id));
          const addable = eligible.filter((u) => !assignedIds.has(u.user_id));
          return (
            <div key={dept.value} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-semibold">{dept.label}</div>
                <Badge tone="muted">{rows.length} คน</Badge>
              </div>

              <div className="space-y-2">
                {rows.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">ยังไม่มีผู้ใช้ในบอร์ดนี้</p>
                ) : (
                  rows.map((r) => {
                    const u = userById.get(r.user_id);
                    return (
                      <div key={r.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                        <Avatar name={u?.name || u?.email || "?"} className="h-7 w-7 text-[10px]" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{u?.name || "—"}</div>
                          <div className="truncate text-xs text-muted-foreground">{u?.app_role}</div>
                        </div>
                        <button
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="นำออกจากบอร์ด"
                          disabled={pending && busyKey === r.id}
                          onClick={() => run(r.id, () => unassignFromBoard(r.id))}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Plus className="h-4 w-4 text-muted-foreground" />
                <Select
                  value=""
                  disabled={addable.length === 0 || (pending && busyKey === dept.value)}
                  onChange={(e) => {
                    const uid = e.target.value;
                    if (uid)
                      run(dept.value, () =>
                        assignToBoard({ boardType, boardKey: dept.value, userId: uid })
                      );
                  }}
                  className="flex-1"
                >
                  <option value="">
                    {addable.length === 0 ? "— ไม่มีผู้ใช้ให้เพิ่ม —" : "+ เพิ่มผู้ใช้เข้าบอร์ด"}
                  </option>
                  {addable.map((u) => (
                    <option key={u.user_id} value={u.user_id}>
                      {(u.name || u.email) + " · " + u.app_role}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        มีเฉพาะผู้ใช้บทบาท {eligibleRoles.join(" / ")} ให้เลือกเข้าบอร์ด
      </p>
    </div>
  );
}
