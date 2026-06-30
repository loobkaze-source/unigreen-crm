"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    signup,
    {}
  );

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">สร้างบัญชีของคุณ</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        เริ่มจัดการไปป์ไลน์การขายของคุณได้ในไม่กี่นาที
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        {state.error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        ) : null}
        {state.message ? (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            {state.message}
          </p>
        ) : null}

        <div>
          <Label htmlFor="fullName">ชื่อ-นามสกุล</Label>
          <Input id="fullName" name="fullName" placeholder="สมชาย ใจดี" autoComplete="name" />
        </div>
        <div>
          <Label htmlFor="email">อีเมล</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            required
          />
        </div>
        <div>
          <Label htmlFor="password">รหัสผ่าน</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="อย่างน้อย 6 ตัวอักษร"
            autoComplete="new-password"
            required
          />
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "กำลังสร้างบัญชี…" : "สร้างบัญชี"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        มีบัญชีอยู่แล้ว?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          เข้าสู่ระบบ
        </Link>
      </p>
    </div>
  );
}
