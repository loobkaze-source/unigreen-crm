"use client";

import { useActionState } from "react";
import { login, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    login,
    {}
  );

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">ยินดีต้อนรับกลับมา</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        เข้าสู่ระบบพื้นที่ทำงาน Unicloud CRM ของคุณ
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="redirectTo" value={redirectTo} />

        {state.error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        ) : null}

        <div>
          <Label htmlFor="identifier">ชื่อผู้ใช้ หรือ อีเมล</Label>
          <Input
            id="identifier"
            name="identifier"
            type="text"
            placeholder="เช่น somchai"
            autoComplete="username"
            autoCapitalize="none"
            required
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">รหัสผ่าน</Label>
            <span className="text-xs text-muted-foreground">
              ลืมรหัส? ติดต่อผู้ดูแลระบบ
            </span>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
        </Button>
      </form>
    </div>
  );
}
