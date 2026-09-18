"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Circle,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Repeat,
  User,
} from "lucide-react";
import type {
  ServiceContract,
  ServiceVisit,
  WorkOrderStatus,
} from "@/lib/database.types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { serviceTypeLabel } from "../constants";
import { statusMeta, woCode } from "../../work-orders/constants";
import { setVisitDueDate } from "../actions";

/** The job raised for a round, as far as this page needs to know it. */
type VisitWorkOrder = {
  id: string;
  number: number | null;
  report_no: string | null;
  status: string;
  completed_at: string | null;
};

export function ContractDetail({
  contract,
  visits,
  workOrders,
  companyName,
  siteName,
  technicianName,
}: {
  contract: ServiceContract;
  visits: ServiceVisit[];
  workOrders: VisitWorkOrder[];
  companyName?: string;
  siteName?: string;
  technicianName?: string;
}) {
  /**
   * A round is served when the job raised for it is finished — not when someone
   * ticked it. The job carries the technician, the parts, the photos and the
   * customer's signature; a tick carries nobody's word for anything.
   */
  const woOf = (v: ServiceVisit) =>
    v.work_order_id ? workOrders.find((w) => w.id === v.work_order_id) ?? null : null;
  const served = (v: ServiceVisit) => woOf(v)?.status === "completed";

  const done = visits.filter(served).length;
  const total = visits.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const today = new Date().toISOString().slice(0, 10);
  const nextDue = visits
    .filter((v) => !served(v))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

  return (
    <div>
      <Link
        href="/service-contracts"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> กลับไปสัญญาบริการ
      </Link>

      <div className="mb-5 flex items-center gap-2">
        {contract.contract_no ? (
          <div className="font-mono text-xs text-muted-foreground">{contract.contract_no}</div>
        ) : null}
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
                const wo = woOf(v);
                const ok = served(v);
                const overdue = !ok && v.due_date < today;
                return (
                  <div
                    key={v.id}
                    className="flex items-start gap-3 rounded-md px-1 py-2 hover:bg-muted/40"
                  >
                    <span className="mt-0.5 text-muted-foreground">
                      {ok ? (
                        <CheckCircle2 className="h-5 w-5 text-success" />
                      ) : (
                        <Circle className="h-5 w-5" />
                      )}
                    </span>
                    <div className="mt-0.5 w-8 text-sm font-semibold text-muted-foreground">
                      #{v.seq}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-sm", ok && "text-muted-foreground")}>
                        ครบกำหนด{" "}
                        {ok ? (
                          <span className="font-medium">{fmtDate(v.due_date)}</span>
                        ) : (
                          <DueDate
                            visit={v}
                            contractId={contract.id}
                            overdue={overdue}
                          />
                        )}
                      </div>
                      {wo ? (
                        <Link
                          href={`/work-orders/${wo.id}`}
                          className="mt-0.5 inline-flex flex-wrap items-center gap-1.5 text-xs hover:underline"
                        >
                          <span className="font-mono text-muted-foreground">{woCode(wo)}</span>
                          <Badge tone={statusMeta(wo.status as WorkOrderStatus).tone}>
                            {statusMeta(wo.status as WorkOrderStatus).label}
                          </Badge>
                          {wo.completed_at ? (
                            <span className="text-muted-foreground">
                              เข้าบริการ {fmtDate(wo.completed_at)}
                            </span>
                          ) : null}
                        </Link>
                      ) : (
                        // Nothing has been raised for this round yet, and that is
                        // the only thing that can move it along.
                        <Link
                          href={`/work-orders?visit=${v.id}`}
                          className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          <Plus className="h-3.5 w-3.5" /> สร้างใบงานสำหรับรอบนี้
                        </Link>
                      )}
                    </div>
                    <Badge tone={ok ? "success" : overdue ? "danger" : "muted"}>
                      {ok ? "เข้าบริการแล้ว" : overdue ? "เลยกำหนด" : "รอเข้าบริการ"}
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

/**
 * A round's due date, as a date you can change.
 *
 * The schedule is a plan, and the plan meets the customer's calendar — the
 * station is closed that week, the rains came, the crew is elsewhere. Shown as
 * the formatted date until it is clicked, so the list still reads as a list;
 * a native date input under it so the phone's own picker does the work. Only
 * for a round still owed: one with a finished job on it happened when it
 * happened, and that date is a fact rather than a plan.
 */
function DueDate({
  visit,
  contractId,
  overdue,
}: {
  visit: ServiceVisit;
  contractId: string;
  overdue: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(visit.due_date);
  // Resync when the server hands back a different date (someone else moved it).
  const [known, setKnown] = useState(visit.due_date);
  if (known !== visit.due_date) {
    setKnown(visit.due_date);
    setValue(visit.due_date);
  }

  function commit(next: string) {
    if (!next || next === visit.due_date) return;
    setValue(next);
    startTransition(async () => {
      const res = await setVisitDueDate(visit.id, contractId, next);
      if (!res.ok) {
        setValue(visit.due_date);
        return alert(res.error);
      }
      router.refresh();
    });
  }

  return (
    <span className="relative inline-flex items-center gap-1">
      <span className={cn("font-medium", overdue && "text-destructive")}>{fmtDate(value)}</span>
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : (
        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      {/* The real control sits over the label, invisible, so a tap anywhere
          on the date opens the picker without the row growing a form. */}
      <input
        type="date"
        lang="en-GB"
        value={value}
        disabled={pending}
        onChange={(e) => commit(e.target.value)}
        aria-label={`เลื่อนวันรอบที่ ${visit.seq}`}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </span>
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
