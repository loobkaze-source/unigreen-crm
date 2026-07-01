import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

/**
 * Server-only Supabase client using the **service-role** key. It bypasses RLS
 * and can manage auth users (create / set passwords). NEVER import this into a
 * Client Component, and never expose the key to the browser.
 *
 * Throws a friendly error if the key isn't configured yet.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!SUPABASE_URL.startsWith("http")) {
    throw new Error("ยังไม่ได้ตั้งค่า Supabase URL");
  }
  if (key.length < 40 || /your-|placeholder|changeme/i.test(key)) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY — เพิ่ม env นี้ใน Netlify และ .env.local ก่อนจึงจะสร้าง/รีเซ็ตรหัสผู้ใช้ได้"
    );
  }
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isAdminKeyConfigured(): boolean {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return key.length >= 40 && !/your-|placeholder|changeme/i.test(key);
}
