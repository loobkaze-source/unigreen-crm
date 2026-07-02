import { redirect } from "next/navigation";
import Image from "next/image";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) redirect("/setup");

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-white lg:flex">
        <Image
          src="/brand/logo-dark.png"
          alt="Unicloud"
          width={168}
          height={35}
          priority
        />
        <div className="relative z-10 max-w-md">
          <h1 className="text-3xl font-bold leading-tight">
            บริหารงานขายและบริการอย่างมืออาชีพ
          </h1>
          <p className="mt-4 text-slate-300">
            ติดตามลูกค้ามุ่งหวัง จัดการไปป์ไลน์การขายและโครงการ
            และไม่พลาดการติดตามผล — ครบจบในที่เดียว
          </p>
        </div>
        <div className="text-sm text-slate-400">
          ขับเคลื่อนด้วย Supabase · ปลอดภัยด้วย Row-Level Security
        </div>
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-mint/25 blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 -left-10 h-72 w-72 rounded-full bg-brand-cyan/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-10 h-72 w-72 rounded-full bg-brand-purple/20 blur-3xl" />
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <>
              <Image
                src="/brand/logo-light.png"
                alt="Unicloud"
                width={150}
                height={31}
                priority
                className="dark:hidden"
              />
              <Image
                src="/brand/logo-dark.png"
                alt="Unicloud"
                width={150}
                height={31}
                priority
                className="hidden dark:block"
              />
            </>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
