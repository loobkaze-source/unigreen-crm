import Link from "next/link";
import { isPast } from "date-fns";
import {
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { getSessionContext, row, rows } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatCurrency } from "@/lib/utils";

export default async function DashboardPage() {
  const { supabase, org, profile, email } = await getSessionContext();

  const [stagesRes, dashStatsRes, contactsRes, upcomingRes] = await Promise.all([
    supabase
      .from("stages")
      .select("*")
      .eq("org_id", org.id)
      .order("position", { ascending: true }),
    // Per-stage deal count/value + open-lead count, aggregated in SQL
    // (migration 0022) instead of pulling every deal/lead row.
    supabase.rpc("dashboard_stats", { p_org: org.id }),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("org_id", org.id),
    supabase
      .from("activities")
      .select("id, subject, due_date, type")
      .eq("org_id", org.id)
      .eq("done", false)
      .not("due_date", "is", null)
      .order("due_date", { ascending: true })
      .limit(6),
  ]);

  const stageList = rows(stagesRes);
  const upcoming = rows(upcomingRes);
  const contactsCount = contactsRes.count ?? 0;
  const agg = (row(dashStatsRes) as {
    per_stage: { stage_id: string; count: number; value: number }[];
    open_leads: number;
  } | null) ?? { per_stage: [], open_leads: 0 };
  const byStage = new Map(agg.per_stage.map((s) => [s.stage_id, s]));
  const totalDeals = agg.per_stage.reduce((s, x) => s + x.count, 0);

  const pipelineValue = stageList
    .filter((s) => !s.is_won && !s.is_lost)
    .reduce((sum, s) => sum + (byStage.get(s.id)?.value ?? 0), 0);
  const wonValue = stageList
    .filter((s) => s.is_won)
    .reduce((sum, s) => sum + (byStage.get(s.id)?.value ?? 0), 0);
  const openLeads = agg.open_leads;

  // Pipeline-by-stage breakdown (exclude lost for clarity)
  const breakdown = stageList
    .filter((s) => !s.is_lost)
    .map((s) => ({
      id: s.id,
      name: s.name,
      is_won: s.is_won,
      count: byStage.get(s.id)?.count ?? 0,
      value: byStage.get(s.id)?.value ?? 0,
    }));
  const maxValue = Math.max(1, ...breakdown.map((b) => b.value));

  const greetingName = profile?.full_name?.split(" ")[0] || email?.split("@")[0] || "คุณ";

  const stats = [
    {
      label: "ไปป์ไลน์ที่เปิดอยู่",
      value: formatCurrency(pipelineValue),
      icon: CircleDollarSign,
      href: "/deals",
      tone: "text-primary bg-accent",
    },
    {
      label: "รายได้ที่ปิดได้",
      value: formatCurrency(wonValue),
      icon: Trophy,
      href: "/deals",
      tone: "text-green-700 bg-green-100",
    },
    {
      label: "ลูกค้ามุ่งหวังที่เปิดอยู่",
      value: String(openLeads),
      icon: UserPlus,
      href: "/leads",
      tone: "text-amber-700 bg-amber-100",
    },
    {
      label: "ผู้ติดต่อ",
      value: String(contactsCount ?? 0),
      icon: Users,
      href: "/contacts",
      tone: "text-sky-700 bg-sky-100",
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">
          ยินดีต้อนรับกลับมา, {greetingName} 👋
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          นี่คือภาพรวมของ {org.name}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <div className="text-sm text-muted-foreground">{s.label}</div>
                  <div className="mt-1 text-2xl font-bold tracking-tight">
                    {s.value}
                  </div>
                </div>
                <span
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-lg",
                    s.tone
                  )}
                >
                  <s.icon className="h-5 w-5" />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Pipeline breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>ไปป์ไลน์ตามขั้นตอน</CardTitle>
            <Link
              href="/deals"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              ดูกระดาน <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {breakdown.length === 0 || totalDeals === 0 ? (
              <EmptyState
                icon={CircleDollarSign}
                title="ยังไม่มีดีล"
                description="สร้างดีลใหม่หรือแปลงลูกค้ามุ่งหวังเพื่อเริ่มต้นไปป์ไลน์ของคุณ"
                className="border-0 py-10"
              />
            ) : (
              <div className="space-y-4">
                {breakdown.map((b) => (
                  <div key={b.id}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {b.name}{" "}
                        <span className="text-muted-foreground">({b.count})</span>
                      </span>
                      <span className="text-muted-foreground">
                        {formatCurrency(b.value)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          b.is_won ? "bg-green-500" : "bg-primary"
                        )}
                        style={{ width: `${(b.value / maxValue) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming activities */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>งานที่ใกล้ถึงกำหนด</CardTitle>
            <Link
              href="/activities"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              ทั้งหมด <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {(upcoming ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                ไม่มีงานที่ใกล้ถึงกำหนด เคลียร์หมดแล้ว 🎉
              </p>
            ) : (
              <ul className="space-y-3">
                {(upcoming ?? []).map((a) => {
                  const overdue = a.due_date && isPast(new Date(a.due_date));
                  return (
                    <li key={a.id} className="flex items-start justify-between gap-3">
                      <span className="text-sm">{a.subject}</span>
                      {a.due_date ? (
                        <span
                          className={cn(
                            "whitespace-nowrap text-xs",
                            overdue ? "font-medium text-destructive" : "text-muted-foreground"
                          )}
                        >
                          {fmtDate(a.due_date)}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <QuickLink href="/leads" icon={UserPlus} title="เพิ่มลูกค้ามุ่งหวัง" />
        <QuickLink href="/contacts" icon={Users} title="เพิ่มผู้ติดต่อ" />
        <QuickLink href="/companies" icon={Building2} title="เพิ่มบริษัท" />
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium shadow-sm transition-shadow hover:shadow-md"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
        <Icon className="h-4.5 w-4.5" />
      </span>
      {title}
      <ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
