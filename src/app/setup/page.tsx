import { redirect } from "next/navigation";
import Image from "next/image";
import { Database } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function SetupPage() {
  if (isSupabaseConfigured()) redirect("/dashboard");

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-12">
      <div className="mb-6">
        <Image src="/brand/logo-light.png" alt="Unicloud" width={150} height={31} priority />
      </div>

      <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
          <Database className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-xl font-bold">เชื่อมต่อโปรเจกต์ Supabase ของคุณ</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          เพิ่มข้อมูลการเชื่อมต่อ Supabase เพื่อเริ่มใช้งาน CRM โดยใส่ค่าไว้ในไฟล์{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">.env.local</code>{" "}
          ที่โฟลเดอร์หลักของโปรเจกต์
        </p>

        <ol className="mt-6 space-y-4 text-sm">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
              1
            </span>
            <span>
              สร้างโปรเจกต์ที่{" "}
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary hover:underline"
              >
                supabase.com
              </a>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
              2
            </span>
            <span>
              ที่ <strong>Project Settings → API</strong> คัดลอก Project URL,
              anon key และ service_role key ไปใส่ในไฟล์{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                .env.local
              </code>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
              3
            </span>
            <span>
              เปิด <strong>SQL Editor</strong> แล้วรันโค้ดทั้งหมดในไฟล์{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                supabase/migrations/0001_init.sql
              </code>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
              4
            </span>
            <span>
              รีสตาร์ตเซิร์ฟเวอร์ (
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                npm run dev
              </code>
              ) แล้วรีเฟรชหน้านี้
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
}
