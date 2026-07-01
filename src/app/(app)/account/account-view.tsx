"use client";

import { useState, useTransition } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "./actions";

export function AccountView({
  name,
  email,
  appRole,
  department,
}: {
  name: string;
  email: string;
  appRole: string;
  department: string;
}) {
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next !== confirm) return setError("รหัสผ่านใหม่และการยืนยันไม่ตรงกัน");
    if (next.length < 6) return setError("รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร");
    startTransition(async () => {
      const res = await changePassword({
        currentPassword: current,
        newPassword: next,
      });
      if (!res.ok) return setError(res.error);
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    });
  }

  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader title="บัญชีของฉัน" subtitle="ข้อมูลผู้ใช้และรหัสผ่าน" />

      {/* Profile card */}
      <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-5 shadow-sm">
        <Avatar name={name || email} className="h-14 w-14 text-base" />
        <div className="min-w-0">
          <div className="text-lg font-semibold">{name}</div>
          <div className="truncate text-sm text-muted-foreground">{email}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="primary">{appRole}</Badge>
            <Badge tone="muted">{department}</Badge>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium">
          <KeyRound className="h-4 w-4 text-primary" />
          เปลี่ยนรหัสผ่าน
        </div>

        <form onSubmit={submit} className="space-y-4">
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {done ? (
            <p className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              <ShieldCheck className="h-4 w-4" /> เปลี่ยนรหัสผ่านเรียบร้อยแล้ว
            </p>
          ) : null}

          <div>
            <Label htmlFor="current">รหัสผ่านปัจจุบัน</Label>
            <Input
              id="current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="next">รหัสผ่านใหม่</Label>
            <Input
              id="next"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="อย่างน้อย 6 ตัวอักษร"
              required
            />
          </div>
          <div>
            <Label htmlFor="confirm">ยืนยันรหัสผ่านใหม่</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "กำลังบันทึก…" : "บันทึกรหัสผ่านใหม่"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
