"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

export async function login(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const redirectTo = String(formData.get("redirectTo") || "/dashboard");

  if (!email || !password) {
    return { error: "กรุณากรอกอีเมลและรหัสผ่าน" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };
  redirect(redirectTo.startsWith("/") ? redirectTo : "/dashboard");
}

export async function signup(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { error: "กรุณากรอกอีเมลและรหัสผ่าน" };
  }
  if (password.length < 6) {
    return { error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) {
    // The DB trigger rejects non-invited emails (invite-only signup).
    const m = error.message || "";
    if (/invite_required|Database error saving new user|Database error/i.test(m)) {
      return {
        error:
          "อีเมลนี้ยังไม่ได้รับคำเชิญ — การสมัครใช้ได้เฉพาะผู้ที่ผู้ดูแลระบบเชิญเท่านั้น",
      };
    }
    return { error: m };
  }

  // If email confirmation is disabled, a session is returned immediately.
  if (data.session) redirect("/dashboard");

  return {
    message:
      "สร้างบัญชีเรียบร้อย กรุณาตรวจสอบอีเมลเพื่อยืนยันที่อยู่ แล้วจึงเข้าสู่ระบบ",
  };
}
