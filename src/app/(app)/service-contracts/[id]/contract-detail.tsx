"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarCheck,
  CalendarRange,
  CheckCircle2,
  Circle,
  History,
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { serviceTypeLabel } from "../constants";
import { statusMeta, woCode } from "../../work-orders/constants";
import { rescheduleContract, setVisitDueDate } from "../actions";
import { ContractFormModal, type Option, type SiteOption } from "../contract-form-modal";

/** A plan as the history records it — or, for a single move, one round. */
export type ScheduleSnapshot = {
  first_visit_date?: string | null;
  frequency_per_year?: number;
  rounds?: { seq: number; due_date: string }[];
  seq?: number;
  due_date?: string;
};

export type ScheduleLogEntry = {
  id: string;
  changed_at: string;
  by: string;
  action: "planned" | "rescheduled" | "moved";
  before: ScheduleSnapshot | null;
  after: ScheduleSnapshot;
  note: string | null;
};

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
  companies,
  sites,
  technicians,
  log,
  companyName,
  siteName,
  technicianName,
}: {
  contract: ServiceContract;
  visits: ServiceVisit[];
  workOrders: VisitWorkOrder[];
  companies: Option[];
  sites: SiteOption[];
  technicians: Option[];
  log: ScheduleLogEntry[];
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

  const router = useRouter();
  const [planning, setPlanning] = useState(false);
  const [editingContract, setEditingContract] = useState(false);
  const [pending, startTransition] = useTransition();
  const [planError, setPlanError] = useState<string | null>(null);
  const [plan, setPlan] = useState({
    from: nextDue?.due_date ?? today,
    frequency_per_year: String(contract.frequency_per_year),
    note: "",
  });
  const owedCount = total - done;
  // What the dialog is about to do, worked out the same way the server will.
  const preview = (() => {
    const freq = Number(plan.frequency_per_year) || 0;
    const end = contract.end_date ?? "";
    if (!plan.from || !freq || !end || plan.from > end) return null;
    const interval = Math.max(1, Math.round(12 / freq));
    const [y, m, d] = plan.from.split("-").map(Number);
    let n = 0;
    let last = plan.from;
    for (let i = 0; ; i++) {
      const dt = new Date(Date.UTC(y, m - 1 + i * interval, d)).toISOString().slice(0, 10);
      if (dt > end) break;
      n++;
      last = dt;
    }
    return { n, last, interval };
  })();

  function submitPlan(e: React.FormEvent) {
    e.preventDefault();
    setPlanError(null);
    startTransition(async () => {
      const res = await rescheduleContract({
        contractId: contract.id,
        from: plan.from,
        frequency_per_year: plan.frequency_per_year,
        note: plan.note,
      });
      if (!res.ok) return setPlanError(res.error);
      setPlanning(false);
      router.refresh();
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
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>สรุปสัญญา</CardTitle>
            <Button variant="secondary" size="sm" onClick={() => setEditingContract(true)}>
              <Pencil className="h-4 w-4" /> แก้ไข
            </Button>
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
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>รอบเข้าบริการ</CardTitle>
            {owedCount > 0 && contract.status === "active" ? (
              <Button variant="secondary" size="sm" onClick={() => setPlanning(true)}>
                <CalendarRange className="h-4 w-4" /> จัดตารางใหม่
              </Button>
            ) : null}
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

        {/* How the plan got to be what it is. */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> ประวัติการเปลี่ยนแปลงตาราง
            </CardTitle>
          </CardHeader>
          <CardContent>
            {log.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                ยังไม่มีการเปลี่ยนแปลง — สัญญานี้สร้างก่อนจะเริ่มบันทึกประวัติ
              </p>
            ) : (
              <ul className="space-y-2">
                {log.map((entry) => (
                  <li key={entry.id} className="rounded-md border border-border px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="font-medium">{describeLog(entry)}</span>
                      <span className="text-xs text-muted-foreground">
                        {fmtDateTime(entry.changed_at)} · {entry.by}
                      </span>
                    </div>
                    {entry.note ? (
                      <div className="mt-0.5 text-xs text-muted-foreground">{entry.note}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <ContractFormModal
        open={editingContract}
        onClose={() => setEditingContract(false)}
        editing={contract}
        companies={companies}
        sites={sites}
        technicians={technicians}
      />

      <Modal
        open={planning}
        onClose={() => setPlanning(false)}
        title="จัดตารางเข้าบริการใหม่"
        description="รอบที่เข้าบริการแล้วคงเดิม · รอบที่ยังค้างจะถูกวางใหม่ตั้งแต่วันที่กำหนด ตามความถี่ จนสิ้นสุดสัญญา"
      >
        <form onSubmit={submitPlan} className="space-y-4">
          {planError ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{planError}</p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="plan_from">วันเริ่มรอบถัดไป</Label>
              <Input
                id="plan_from"
                type="date"
                required
                value={plan.from}
                max={contract.end_date ?? undefined}
                onChange={(e) => setPlan({ ...plan, from: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="plan_freq">ครั้ง/ปี</Label>
              <Input
                id="plan_freq"
                type="number"
                min="1"
                max="12"
                required
                value={plan.frequency_per_year}
                onChange={(e) => setPlan({ ...plan, frequency_per_year: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="plan_note">เหตุผล (บันทึกลงประวัติ)</Label>
            <Textarea
              id="plan_note"
              rows={2}
              value={plan.note}
              onChange={(e) => setPlan({ ...plan, note: e.target.value })}
              placeholder="เช่น ลูกค้าขอเปลี่ยนเป็นทุก 3 เดือน / ปั๊มปิดปรับปรุงเดือนตุลาคม"
            />
          </div>
          <p className="rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
            เข้าบริการแล้ว {done} รอบ คงเดิม ·{" "}
            {preview
              ? `จะวางใหม่ ${preview.n} รอบ ทุก ${preview.interval} เดือน ตั้งแต่ ${fmtDate(plan.from)} ถึง ${fmtDate(preview.last)} (แทนที่ ${owedCount} รอบที่ค้าง)`
              : "เลือกวันและความถี่ที่ใช้ได้ก่อน"}
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setPlanning(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending || !preview}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pending ? "กำลังจัดตาราง…" : "จัดตารางใหม่"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/**
 * One history line, in words. A reschedule of eight rounds is one decision
 * and reads as one line; the eight dates are in the record if anyone asks.
 */
function describeLog(e: ScheduleLogEntry) {
  if (e.action === "moved") {
    return `เลื่อนรอบที่ ${e.after.seq} จาก ${fmtDate(e.before?.due_date ?? "")} เป็น ${fmtDate(e.after.due_date ?? "")}`;
  }
  const rounds = e.after.rounds ?? [];
  const first = rounds[0]?.due_date;
  const last = rounds[rounds.length - 1]?.due_date;
  const span = first && last ? ` ${fmtDate(first)} – ${fmtDate(last)}` : "";
  if (e.action === "planned") {
    return `วางแผน ${rounds.length} รอบ ปีละ ${e.after.frequency_per_year} ครั้ง${span}`;
  }
  const was = e.before?.rounds?.length ?? 0;
  const freqWas = e.before?.frequency_per_year;
  const freqChange =
    freqWas && freqWas !== e.after.frequency_per_year
      ? ` · ความถี่ ${freqWas} → ${e.after.frequency_per_year} ครั้ง/ปี`
      : "";
  return `จัดตารางใหม่ ${was} → ${rounds.length} รอบ${span}${freqChange}`;
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
