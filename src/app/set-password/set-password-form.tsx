"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forceSetPassword } from "./actions";

export function SetPasswordForm({ email }: { email: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) return setError("รหัสผ่านใหม่และการยืนยันไม่ตรงกัน");
    if (next.length < 6) return setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
    start(async () => {
      const res = await forceSetPassword(next);
      if (!res.ok) return setError(res.error);
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <Image
          src="/brand/logo-light.png"
          alt="Unicloud"
          width={140}
          height={29}
          priority
          className="mb-6"
        />
        <div className="mb-1 flex items-center gap-2 text-lg font-bold">
          <KeyRound className="h-5 w-5 text-primary" /> ตั้งรหัสผ่านใหม่
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          ยินดีต้อนรับ {email} — เพื่อความปลอดภัย กรุณาตั้งรหัสผ่านของคุณเองก่อนเริ่มใช้งาน
        </p>

        <form onSubmit={submit} className="space-y-4">
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
          <div>
            <Label htmlFor="next">รหัสผ่านใหม่</Label>
            <Input
              id="next"
              type="password"
              autoComplete="new-password"
              placeholder="อย่างน้อย 6 ตัวอักษร"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              autoFocus
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
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "กำลังบันทึก…" : "บันทึกและเข้าใช้งาน"}
          </Button>
        </form>

        <form action="/auth/signout" method="post" className="mt-4 text-center">
          <button type="submit" className="text-xs text-muted-foreground hover:text-foreground">
            ออกจากระบบ
          </button>
        </form>
      </div>
    </div>
  );
}
