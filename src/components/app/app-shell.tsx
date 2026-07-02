"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Box,
  Building2,
  ChevronDown,
  ClipboardList,
  HardHat,
  Handshake,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  LogOut,
  MapPin,
  Menu,
  Package,
  Repeat,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  Workflow,
  Wrench,
  X,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { LoadingScreen } from "@/components/ui/spinner";
import { TECH_ROUTES, isTechnicianAllowed, routeMatches } from "@/lib/nav-access";

const NAV = [
  { href: "/dashboard", label: "แดชบอร์ด", icon: LayoutDashboard },
  { href: "/companies", label: "ลูกค้า", icon: Building2 },
  { href: "/contacts", label: "ผู้ติดต่อ", icon: Users },
  { href: "/deals", label: "ดีล", icon: Handshake },
  { href: "/sites", label: "ไซต์งาน", icon: MapPin },
  { href: "/assets", label: "Asset", icon: Box },
  { href: "/service-board", label: "Service Board", icon: ClipboardList },
  { href: "/cases", label: "เคส", icon: LifeBuoy },
  { href: "/work-orders", label: "งานบริการ", icon: Wrench },
  { href: "/service-contracts", label: "สัญญาบริการ", icon: Repeat },
  { href: "/warranties", label: "การรับประกัน", icon: ShieldCheck },
  { href: "/technicians", label: "ช่าง", icon: HardHat },
  { href: "/products", label: "สินค้า", icon: Package },
  { href: "/activities", label: "กิจกรรม", icon: ListChecks },
] as const;

// Admin-only settings submenu.
const SETTINGS_NAV = [
  { href: "/users", label: "ผู้ใช้", icon: UserCog },
  { href: "/settings/pipelines", label: "ไปป์ไลน์", icon: Workflow },
  { href: "/settings/service-boards", label: "Service Board", icon: Wrench },
];

export function AppShell({
  user,
  orgName,
  appRole = null,
  isAdmin = false,
  children,
}: {
  user: { name: string; email: string };
  orgName: string;
  appRole?: string | null;
  isAdmin?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const isTechnician = !isAdmin && appRole === "Technician";

  const visibleNav = NAV.filter(
    (item) => !isTechnician || TECH_ROUTES.some((r) => r === item.href)
  );

  const [settingsOpen, setSettingsOpen] = useState(
    () => pathname.startsWith("/users") || pathname.startsWith("/settings")
  );

  const blocked = isTechnician && !isTechnicianAllowed(pathname);

  useEffect(() => {
    if (blocked) router.replace("/sites");
  }, [blocked, router]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      {/* Mobile backdrop */}
      {open ? (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/dashboard" className="flex items-center">
            <Image
              src="/brand/logo-dark.png"
              alt="Unicloud"
              width={144}
              height={30}
              priority
            />
          </Link>
          <button
            className="rounded-md p-1 text-slate-400 hover:text-white lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="ปิดเมนู"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-3 pb-2">
          <div className="rounded-lg bg-sidebar-accent px-3 py-2 text-xs text-slate-400">
            พื้นที่ทำงาน
            <div className="truncate text-sm font-medium text-white">{orgName}</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {visibleNav.map((item) => {
            const active = routeMatches(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-white"
                    : "text-slate-300 hover:bg-sidebar-accent hover:text-white"
                )}
              >
                <item.icon className="h-4.5 w-4.5" />
                {item.label}
              </Link>
            );
          })}

          {isAdmin ? (
            <div className="pt-1">
              <button
                onClick={() => setSettingsOpen((o) => !o)}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-sidebar-accent hover:text-white"
              >
                <Settings className="h-4.5 w-4.5" />
                ตั้งค่า
                <ChevronDown
                  className={cn(
                    "ml-auto h-4 w-4 transition-transform",
                    settingsOpen && "rotate-180"
                  )}
                />
              </button>
              {settingsOpen ? (
                <div className="mt-1 space-y-1 border-l border-white/10 pl-3">
                  {SETTINGS_NAV.map((item) => {
                    const active = routeMatches(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-primary text-white"
                            : "text-slate-300 hover:bg-sidebar-accent hover:text-white"
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 hover:bg-sidebar-accent"
              title="บัญชีของฉัน"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                {initials(user.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white">
                  {user.name}
                </div>
                <div className="truncate text-xs text-slate-400">{user.email}</div>
              </div>
            </Link>
            <ThemeToggle className="rounded-md p-1.5 text-slate-400 hover:bg-sidebar-accent hover:text-white" />
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="rounded-md p-1.5 text-slate-400 hover:bg-sidebar-accent hover:text-white"
              title="ตั้งค่าบัญชี"
              aria-label="ตั้งค่าบัญชี"
            >
              <Settings className="h-4 w-4" />
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-md p-1.5 text-slate-400 hover:bg-sidebar-accent hover:text-white"
                title="ออกจากระบบ"
                aria-label="ออกจากระบบ"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-screen flex-col">
        {/* Mobile top bar */}
        <div className="flex h-16 items-center gap-3 border-b border-border bg-card px-4 lg:hidden">
          <button
            onClick={() => setOpen(true)}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted"
            aria-label="เปิดเมนู"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Image
            src="/brand/logo-light.png"
            alt="Unicloud"
            width={120}
            height={25}
            className="dark:hidden"
          />
          <Image
            src="/brand/logo-dark.png"
            alt="Unicloud"
            width={120}
            height={25}
            className="hidden dark:block"
          />
          <ThemeToggle className="ml-auto rounded-md p-2 text-muted-foreground hover:bg-muted" />
        </div>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {blocked ? <LoadingScreen label="กำลังเปลี่ยนหน้า…" /> : children}
        </main>
      </div>
    </div>
  );
}
