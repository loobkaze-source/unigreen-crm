"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Circle,
  MapPin,
  Repeat,
  User,
} from "lucide-react";
import type { ServiceContract, ServiceVisit } from "@/lib/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { serviceTypeLabel, visitStatusMeta } from "../constants";
import { markVisit } from "../actions";

export function ContractDetail({
  contract,
  visits,
  companyName,
  siteName,
  technicianName,
}: {
  contract: ServiceContract;
  visits: ServiceVisit[];
  companyName?: string;
  siteName?: string;
  technicianName?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const done = visits.filter((v) => v.status === "done").length;
  const total = visits.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const today = new Date().toISOString().slice(0, 10);
  const nextDue = visits
    .filter((v) => v.status === "pending")
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

  function toggle(v: ServiceVisit) {
    const next = v.status === "done" ? "pending" : "done";
    startTransition(async () => {
      const res = await markVisit(v.id, next, contract.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <Link
        href="/service-contracts"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> กลับไปสัญญาบริการ
      </Link>

      <div className="mb-5 flex items-center gap-2">
        <h1 className="text-xl font-bold tracking-tight">{contract.title}</h1>
        <Badge tone={contract.status === "active" ? "success" : "muted"}>
          {contract.status === "active" ? "ใช้งาน" : contract.status}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle>สรุปสัญญา</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Info icon={Repeat} label="ประเภท" value={serviceTypeLabel(contract.service_type)} />
            <Info
              icon={CalendarCheck}
              label="ความถี่"
              value={`ปีละ ${contract.frequency_per_year} ครั้ง · ${contract.duration_years} ปี`}
            />
            <Info icon={Building2} label="ลูกค้า" value={companyName || "—"} />
            <Info icon={MapPin} label="ไซต์งาน" value={siteName || "—"} />
            <Info icon={User} label="ช่างประจำ" value={technicianName || "—"} />
            <Info
              icon={CalendarCheck}
              label="ระยะสัญญา"
              value={`${fmtDate(contract.start_date)} – ${
                contract.end_date ? fmtDate(contract.end_date) : "—"
              }`}
            />

            <div className="rounded-lg bg-muted/50 p-3">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">เข้าบริการแล้ว</span>
                <span className="text-muted-foreground">
                  {done}/{total} ครั้ง
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {nextDue
                  ? `รอบถัดไป: ${fmtDate(nextDue.due_date)}`
                  : "ครบทุกรอบแล้ว 🎉"}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Visit schedule */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>รอบเข้าบริการ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {visits.map((v) => {
                const meta = visitStatusMeta(v.status);
                const overdue = v.status === "pending" && v.due_date < today;
                return (
                  <div
                    key={v.id}
                    className="flex items-center gap-3 rounded-md px-1 py-2 hover:bg-muted/40"
                  >
                    <button
                      onClick={() => toggle(v)}
                      disabled={pending}
                      className="text-muted-foreground hover:text-primary disabled:opacity-50"
                      aria-label="สลับสถานะ"
                    >
                      {v.status === "done" ? (
                        <CheckCircle2 className="h-5 w-5 text-success" />
                      ) : (
                        <Circle className="h-5 w-5" />
                      )}
                    </button>
                    <div className="w-8 text-sm font-semibold text-muted-foreground">
                      #{v.seq}
                    </div>
                    <div className="flex-1">
                      <div
                        className={cn(
                          "text-sm",
                          v.status === "done" && "text-muted-foreground"
                        )}
                      >
                        ครบกำหนด{" "}
                        <span
                          className={cn(
                            "font-medium",
                            overdue && "text-destructive"
                          )}
                        >
                          {fmtDate(v.due_date)}
                        </span>
                      </div>
                      {v.completed_at ? (
                        <div className="text-xs text-muted-foreground">
                          เข้าบริการ {fmtDate(v.completed_at)}
                        </div>
                      ) : null}
                    </div>
                    <Badge tone={overdue ? "danger" : meta.tone}>
                      {overdue ? "เลยกำหนด" : meta.label}
                    </Badge>
                  </div>
                );
              })}
              {visits.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  ยังไม่มีรอบเข้าบริการ
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm">{value}</div>
      </div>
    </div>
  );
}
