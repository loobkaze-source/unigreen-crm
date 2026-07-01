"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (error) return setError(error.message);
    setStep("otp");
    setInfo("ส่งรหัส OTP ไปที่อีเมลแล้ว — กรอกรหัสจากอีเมลพร้อมตั้งรหัสผ่านใหม่");
  }

  async function verifyAndSet(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6)
      return setError("รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร");
    if (password !== confirm) return setError("รหัสผ่านใหม่และการยืนยันไม่ตรงกัน");

    setBusy(true);
    const supabase = createClient();
    const { error: vErr } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: "email",
    });
    if (vErr) {
      setBusy(false);
      return setError("รหัส OTP ไม่ถูกต้องหรือหมดอายุ");
    }
    const { error: uErr } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (uErr) return setError(uErr.message);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">ตั้งรหัสผ่านใหม่</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        รับรหัส OTP ทางอีเมลเพื่อยืนยันตัวตนและตั้งรหัสผ่านใหม่
      </p>

      {info ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {info}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {step === "email" ? (
        <form onSubmit={sendOtp} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">อีเมล</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "กำลังส่ง…" : "ส่งรหัส OTP"}
          </Button>
        </form>
      ) : (
        <form onSubmit={verifyAndSet} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="token">รหัส OTP จากอีเมล</Label>
            <Input
              id="token"
              inputMode="numeric"
              placeholder="เช่น 123456"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="password">รหัสผ่านใหม่</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="อย่างน้อย 6 ตัวอักษร"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "กำลังยืนยัน…" : "ยืนยันและตั้งรหัสผ่านใหม่"}
          </Button>
          <button
            type="button"
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
            onClick={() => {
              setStep("email");
              setToken("");
              setInfo(null);
              setError(null);
            }}
          >
            ← เปลี่ยนอีเมล / ส่งรหัสใหม่
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          ← กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </p>
    </div>
  );
}
