"use client";

import { useState, useTransition } from "react";
import { Clock, FileText, Loader2 } from "lucide-react";
import type { WorkOrder } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { WO_BILLING, WO_WORK_KINDS } from "../constants";
import { saveServiceReport, type ServiceReportPatch } from "../actions";

/** A tick on the paper form, sized for a thumb rather than a mouse. */
function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        on
          ? "border-primary bg-primary text-white"
          : "border-border bg-card text-muted-foreground active:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

function SaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <Button onClick={onClick} disabled={saving}>
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {saving ? "กำลังบันทึก…" : "บันทึก"}
    </Button>
  );
}

/** `<input type="datetime-local">` wants local wall-clock, not an ISO instant. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(
    d.getMinutes()
  )}`;
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function useSave(workOrderId: string, onSaved: () => void) {
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();
  return {
    saving,
    save(patch: ServiceReportPatch) {
      setSaving(true);
      startTransition(async () => {
        const res = await saveServiceReport(workOrderId, patch);
        setSaving(false);
        if (!res.ok) alert(res.error);
        else onSaved();
      });
    },
  };
}

/**
 * The head of the paper report: its own number, the customer's job number, and
 * the boxes ticked across items 6–14.
 *
 * Items 6–8 are how the visit is charged and only one can be true, so they stay
 * the job's `billing`. Items 9–14 are what was done, and a visit is regularly
 * several of them at once — a repair that ends in a calibration — so those are
 * a set.
 */
export function ServiceReportCard({
  workOrder,
  onSaved,
}: {
  workOrder: WorkOrder;
  onSaved: () => void;
}) {
  const { saving, save } = useSave(workOrder.id, onSaved);
  const [reportNo, setReportNo] = useState(workOrder.report_no ?? "");
  const [jobNo, setJobNo] = useState(workOrder.customer_job_no ?? "");
  const [billing, setBilling] = useState<string | null>(workOrder.billing);
  const [kinds, setKinds] = useState<string[]>(workOrder.work_kinds ?? []);

  const toggle = (k: string) =>
    setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4" /> รายงานการซ่อม
        </CardTitle>
        <SaveButton
          saving={saving}
          onClick={() =>
            save({
              report_no: reportNo,
              customer_job_no: jobNo,
              billing,
              work_kinds: kinds,
            })
          }
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="report_no">เลขที่รายงาน (SERVICE REPORT NO.)</Label>
            <Input
              id="report_no"
              value={reportNo}
              onChange={(e) => setReportNo(e.target.value)}
              placeholder={workOrder.case_id ? "ระบบออกให้" : "เช่น 96MDD-13832"}
            />
            {/* Issued from the case, because one fault can take more than one
                visit and each visit leaves its own signed report. Still typed
                over when the technician tears a page from the printed book. */}
            <p className="mt-1 text-xs text-muted-foreground">
              {workOrder.case_id
                ? "ออกให้จากรหัสเคส · ครั้งที่เข้าไปแก้ (แก้เองได้)"
                : "ยังไม่ได้ผูกกับเคส จึงยังไม่มีเลขให้อัตโนมัติ"}
            </p>
          </div>
          <div>
            <Label htmlFor="customer_job_no">JOB NO. ของลูกค้า</Label>
            <Input
              id="customer_job_no"
              value={jobNo}
              onChange={(e) => setJobNo(e.target.value)}
              placeholder="เช่น 9476691D-1004179"
            />
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">การเรียกเก็บ (ข้อ 6–8)</div>
          <div className="flex flex-wrap gap-2">
            {WO_BILLING.map((b) => (
              <Chip
                key={b.value}
                on={billing === b.value}
                // Tapping the one already on clears it: not every visit is billed.
                onClick={() => setBilling(billing === b.value ? null : b.value)}
              >
                {b.label}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">ลักษณะงาน (ข้อ 9–14)</div>
          <div className="flex flex-wrap gap-2">
            {WO_WORK_KINDS.map((k) => (
              <Chip key={k.value} on={kinds.includes(k.value)} onClick={() => toggle(k.value)}>
                {k.label}
              </Chip>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** "1 ชม. 20 นาที" — the form wants the span, not two timestamps to subtract. */
function spanLabel(fromIso: string | null, toIso: string | null) {
  if (!fromIso || !toIso) return null;
  const mins = Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000);
  if (!Number.isFinite(mins)) return null;
  if (mins < 0) return "เวลาเสร็จอยู่ก่อนเวลาเริ่ม";
  const h = Math.floor(mins / 60);
  return h ? `${h} ชม.${mins % 60 ? ` ${mins % 60} นาที` : ""}` : `${mins} นาที`;
}

/**
 * เวลาเริ่มงาน–ถึง and ระยะทาง/MILEAGE, with the totals worked out rather than
 * asked for — the paper form has a column for each and they are only ever the
 * difference between the two beside them.
 *
 * The two "ตอนนี้" buttons write and save in one tap, because the moment a
 * technician wants to record is the moment they are standing there with a
 * screwdriver in the other hand.
 */
export function TimeMileageCard({
  workOrder,
  onSaved,
}: {
  workOrder: WorkOrder;
  onSaved: () => void;
}) {
  const { saving, save } = useSave(workOrder.id, onSaved);
  const [startAt, setStartAt] = useState(toLocalInput(workOrder.started_at));
  const [endAt, setEndAt] = useState(toLocalInput(workOrder.finished_at));
  const [from, setFrom] = useState(workOrder.mileage_start?.toString() ?? "");
  const [to, setTo] = useState(workOrder.mileage_end?.toString() ?? "");

  const span = spanLabel(fromLocalInput(startAt), fromLocalInput(endAt));
  const backwards = span === "เวลาเสร็จอยู่ก่อนเวลาเริ่ม";
  const km =
    from !== "" && to !== "" && Number.isFinite(Number(from)) && Number.isFinite(Number(to))
      ? Number(to) - Number(from)
      : null;

  const patch = () => ({
    started_at: fromLocalInput(startAt),
    finished_at: fromLocalInput(endAt),
    mileage_start: from === "" ? null : Number(from),
    mileage_end: to === "" ? null : Number(to),
  });

  /** Stamp now into one of the two and save straight away. */
  function stamp(which: "start" | "end") {
    const now = toLocalInput(new Date().toISOString());
    if (which === "start") setStartAt(now);
    else setEndAt(now);
    save({
      ...patch(),
      [which === "start" ? "started_at" : "finished_at"]: fromLocalInput(now),
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-4 w-4" /> เวลาและระยะทาง
        </CardTitle>
        <SaveButton saving={saving} onClick={() => save(patch())} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="started_at">เวลาเริ่มงาน</Label>
              <button
                type="button"
                onClick={() => stamp("start")}
                className="text-xs font-medium text-primary active:opacity-70"
              >
                ตอนนี้
              </button>
            </div>
            <Input
              id="started_at"
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="finished_at">เวลาเสร็จงาน</Label>
              <button
                type="button"
                onClick={() => stamp("end")}
                className="text-xs font-medium text-primary active:opacity-70"
              >
                ตอนนี้
              </button>
            </div>
            <Input
              id="finished_at"
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
            />
          </div>
        </div>
        {span ? (
          <p className={cn("text-sm", backwards ? "text-destructive" : "text-muted-foreground")}>
            รวมเวลาทำงาน <span className="font-medium text-foreground">{span}</span>
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="mileage_start">เลขไมล์ออก (กม.)</Label>
            <Input
              id="mileage_start"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="mileage_end">เลขไมล์กลับ (กม.)</Label>
            <Input
              id="mileage_end"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        {km != null ? (
          <p className={cn("text-sm", km < 0 ? "text-destructive" : "text-muted-foreground")}>
            {km < 0 ? (
              "เลขไมล์กลับน้อยกว่าเลขไมล์ออก"
            ) : (
              <>
                รวมระยะทาง{" "}
                <span className="font-medium text-foreground">
                  {km.toLocaleString("th-TH", { maximumFractionDigits: 1 })} กม.
                </span>
              </>
            )}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
