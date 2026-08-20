"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  MapPin,
  Navigation,
  Phone,
  PenLine,
  PlayCircle,
  User,
  ThumbsUp,
} from "lucide-react";
import type { WorkOrderPriority, WorkOrderStatus, WorkOrderType } from "@/lib/database.types";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import { statusMeta, priorityMeta, typeLabel, woCode, jobClassLabel } from "../work-orders/constants";
import { createClient } from "@/lib/supabase/client";
import { SignaturePad } from "@/components/app/signature-pad";
import {
  acceptWorkOrder,
  saveWorkOrderSignature,
  updateWorkOrderStatus,
} from "../work-orders/actions";

export type Job = {
  id: string;
  number: number | null;
  /** The service-report number, when the job has one — see woCode. */
  reportNo: string | null;
  title: string;
  status: WorkOrderStatus;
  type: WorkOrderType;
  priority: WorkOrderPriority;
  job_class: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  accepted_at: string | null;
  company: string | null;
  companyPhone: string | null;
  contactName: string | null;
  contactPhone: string | null;
  siteName: string | null;
  address: string | null;
  mapUrl: string | null;
  /** The customer's signature for this job, once there is one. */
  signatureUrl: string | null;
  signedBy: string | null;
  signedAt: string | null;
};

const DONE: WorkOrderStatus[] = ["completed", "cancelled"];

/** The three buckets a technician filters by. */
type Cat = "new" | "accepted" | "done";
const catOf = (j: Job): Cat =>
  DONE.includes(j.status) ? "done" : j.accepted_at ? "accepted" : "new";

const CATS: { key: Cat; label: string }[] = [
  { key: "new", label: "งานใหม่" },
  { key: "accepted", label: "รับแล้ว" },
  { key: "done", label: "เสร็จแล้ว" },
];

/** Local midnight boundaries — jobs are scheduled in the technician's own day. */
function dayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function MyJobsView({
  jobs,
  technicianName,
  linked,
  orgId,
}: {
  jobs: Job[];
  technicianName: string | null;
  linked: boolean;
  orgId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  /** The job whose customer is signing right now, if any. */
  const [signing, setSigning] = useState<Job | null>(null);

  /**
   * The drawing goes to storage from the browser, as photos do, and only the
   * path it landed at is sent to the server.
   */
  async function saveSignature(png: Blob, signedBy: string) {
    const job = signing;
    if (!job) return;
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${orgId}/${job.id}/signature-${Date.now()}-${rand}.png`;
    const { error } = await createClient()
      .storage.from("wo-photos")
      .upload(path, png, { cacheControl: "3600", upsert: false });
    if (error) return alert(`บันทึกลายเซ็นไม่สำเร็จ: ${error.message}`);
    const res = await saveWorkOrderSignature(job.id, path, signedBy);
    if (!res.ok) return alert(res.error);
    setSigning(null);
    router.refresh();
  }

  // Which buckets are shown. All on by default; tapping a chip filters it out.
  const [shown, setShown] = useState<Cat[]>(["new", "accepted", "done"]);
  const toggleCat = (c: Cat) =>
    setShown((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const counts = useMemo(() => {
    const m: Record<Cat, number> = { new: 0, accepted: 0, done: 0 };
    for (const j of jobs) m[catOf(j)]++;
    return m;
  }, [jobs]);

  const visible = useMemo(() => jobs.filter((j) => shown.includes(catOf(j))), [jobs, shown]);

  const groups = useMemo(() => {
    const { start, end } = dayBounds();
    const open = visible.filter((j) => !DONE.includes(j.status));
    const at = (j: Job) => (j.scheduled_start ? new Date(j.scheduled_start) : null);

    return [
      {
        key: "overdue",
        label: "เลยกำหนด",
        tone: "text-red-600 dark:text-red-400",
        items: open.filter((j) => {
          const d = at(j);
          return d != null && d < start;
        }),
      },
      {
        key: "today",
        label: "วันนี้",
        tone: "text-primary",
        items: open.filter((j) => {
          const d = at(j);
          return d != null && d >= start && d < end;
        }),
      },
      {
        key: "upcoming",
        label: "ถัดไป",
        tone: "text-foreground",
        items: open.filter((j) => {
          const d = at(j);
          return d != null && d >= end;
        }),
      },
      {
        key: "unscheduled",
        label: "ยังไม่ระบุวัน",
        tone: "text-muted-foreground",
        items: open.filter((j) => at(j) == null),
      },
      {
        key: "done",
        label: "เสร็จแล้ว",
        tone: "text-muted-foreground",
        items: visible.filter((j) => DONE.includes(j.status)).slice(0, 20),
      },
    ].filter((g) => g.items.length > 0);
  }, [visible]);

  function run(job: Job, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusyId(job.id);
    startTransition(async () => {
      const res = await fn();
      setBusyId(null);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }
  const setStatus = (job: Job, status: WorkOrderStatus) =>
    run(job, () => updateWorkOrderStatus(job.id, status));
  const accept = (job: Job) => run(job, () => acceptWorkOrder(job.id));

  const openCount = jobs.filter((j) => !DONE.includes(j.status)).length;

  if (!linked) {
    return (
      <div>
        <PageHeader title="งานของฉัน" />
        <EmptyState
          icon={ClipboardList}
          title="ยังไม่ได้เชื่อมบัญชีกับทะเบียนช่าง"
          description="บัญชีนี้ยังไม่ผูกกับรายชื่อช่าง จึงยังไม่มีงานแสดง — แจ้งแอดมินให้กด “ดึงช่างจากผู้ใช้ Technician” ที่หน้าช่าง"
        />
      </div>
    );
  }

  return (
    <div className="pb-4">
      <PageHeader
        title="งานของฉัน"
        subtitle={
          technicianName
            ? `${technicianName} · ค้างอยู่ ${openCount} งาน`
            : `ค้างอยู่ ${openCount} งาน`
        }
      />

      {/* Filter chips — big enough to hit with a thumb. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {CATS.map((c) => {
          const on = shown.includes(c.key);
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => toggleCat(c.key)}
              aria-pressed={on}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                on
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-card text-muted-foreground"
              )}
            >
              {c.label}
              <span className={cn("ml-1.5", on ? "text-white/80" : "text-muted-foreground")}>
                {counts[c.key]}
              </span>
            </button>
          );
        })}
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={jobs.length === 0 ? "ยังไม่มีงานที่มอบหมาย" : "ไม่มีงานในตัวกรองนี้"}
          description={
            jobs.length === 0
              ? "เมื่อมีการมอบหมายใบสั่งงานให้คุณ งานจะขึ้นที่นี่"
              : "แตะปุ่มด้านบนเพื่อเปิดหมวดที่ถูกกรองออกกลับมา"
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className={cn("mb-2 text-sm font-semibold", g.tone)}>
                {g.label}
                <span className="ml-1.5 font-normal text-muted-foreground">({g.items.length})</span>
              </h2>
              <div className="space-y-2">
                {g.items.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    busy={pending && busyId === job.id}
                    onStatus={(s) => setStatus(job, s)}
                    onAccept={() => accept(job)}
                    onSign={() => setSigning(job)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <SignaturePad
        open={signing !== null}
        onClose={() => setSigning(null)}
        onSave={saveSignature}
        subtitle={
          signing
            ? [woCode(signing), signing.title].filter(Boolean).join(" · ")
            : undefined
        }
        defaultName={signing?.contactName ?? ""}
      />
    </div>
  );
}

function JobCard({
  job,
  busy,
  onStatus,
  onAccept,
  onSign,
}: {
  job: Job;
  busy: boolean;
  onStatus: (s: WorkOrderStatus) => void;
  onAccept: () => void;
  onSign: () => void;
}) {
  const st = statusMeta(job.status);
  const pr = priorityMeta(job.priority);
  const done = DONE.includes(job.status);
  const needsAccept = !done && !job.accepted_at;
  // The person on site beats the company switchboard.
  const callNumber = job.contactPhone ?? job.companyPhone;

  /**
   * A job cannot close unsigned, so the button leads to the signature instead of
   * refusing — the pad is the next thing that has to happen either way, and a
   * dead button on a phone reads as a broken one.
   */
  const signed = !!job.signatureUrl;

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <Link href={`/work-orders/${job.id}`} className="block p-4 active:bg-muted/40">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs text-muted-foreground">{woCode(job)}</span>
              <Badge tone={st.tone}>{st.label}</Badge>
              {job.priority === "urgent" || job.priority === "high" ? (
                <Badge tone={pr.tone}>{pr.label}</Badge>
              ) : null}
              {needsAccept ? <Badge tone="warning">รอรับงาน</Badge> : null}
            </div>
            <div className="mt-1 font-medium leading-snug">{job.title}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {typeLabel(job.type)}
              {job.job_class ? ` · ${jobClassLabel(job.job_class)}` : ""}
            </div>
          </div>
          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
        </div>

        <div className="mt-3 space-y-1.5 text-sm">
          {job.scheduled_start ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarClock className="h-4 w-4 shrink-0" />
              <span>{fmtDateTime(job.scheduled_start)}</span>
            </div>
          ) : null}
          {/* Shown as plain text, not a tel: link — the whole card is already a
              link to the job, and nesting anchors is invalid. Dialling happens
              from the full-width button below, which is easier to hit anyway. */}
          {job.contactName || job.contactPhone ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">
                {job.contactName ?? "ผู้ติดต่อ"}
                {job.contactPhone ? (
                  <span className="font-medium text-foreground"> · {job.contactPhone}</span>
                ) : null}
              </span>
            </div>
          ) : null}
          {job.siteName || job.address ? (
            <div className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">
                {job.company ? <span className="text-foreground">{job.company}</span> : null}
                {job.company && job.siteName ? " · " : ""}
                {job.siteName}
                {job.address ? <span className="block text-xs">{job.address}</span> : null}
              </span>
            </div>
          ) : null}
        </div>
      </Link>

      {/* The customer signs the job off here. Not offered before the job has
          been accepted — nobody is standing in front of the customer yet. */}
      {needsAccept ? null : (
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">ลายเซ็นลูกค้า</span>
            {job.signatureUrl ? (
              <button
                type="button"
                onClick={onSign}
                className="text-xs font-medium text-primary active:opacity-70"
              >
                เซ็นใหม่
              </button>
            ) : null}
          </div>
          {job.signatureUrl ? (
            <div className="mt-2 flex items-center gap-3">
              <Image
                src={job.signatureUrl}
                alt="ลายเซ็นลูกค้า"
                width={240}
                height={80}
                unoptimized
                className="h-14 w-auto rounded border border-border bg-white object-contain"
              />
              <div className="min-w-0 text-xs text-muted-foreground">
                <div className="truncate text-sm text-foreground">{job.signedBy || "—"}</div>
                {job.signedAt ? <div>{fmtDateTime(job.signedAt)}</div> : null}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSign}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-3 text-sm font-medium text-primary active:bg-muted"
            >
              <PenLine className="h-4 w-4" /> ขอลายเซ็นลูกค้า
            </button>
          )}
        </div>
      )}

      {/* Field actions — big tap targets, no page change needed. Skipped
          entirely when there is nothing to put in it, or the strip of border
          it is drawn on shows up as a line under the card. */}
      <div
        className={cn(
          "flex items-stretch gap-px border-t border-border bg-border",
          !job.mapUrl && !callNumber && !needsAccept && (done || job.status === "in_progress")
            && "hidden"
        )}
      >
        {job.mapUrl ? (
          <a
            href={job.mapUrl}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 bg-card py-3 text-sm font-medium text-primary active:bg-muted"
          >
            <Navigation className="h-4 w-4" /> นำทาง
          </a>
        ) : null}
        {callNumber ? (
          <a
            href={`tel:${callNumber}`}
            className="flex flex-1 items-center justify-center gap-1.5 bg-card py-3 text-sm font-medium text-primary active:bg-muted"
          >
            <Phone className="h-4 w-4" />
            {job.contactPhone ? "โทรผู้ติดต่อ" : "โทรลูกค้า"}
          </a>
        ) : null}
        {needsAccept ? (
          // Acknowledge first — the dispatcher needs to know the job was seen.
          <button
            type="button"
            disabled={busy}
            onClick={onAccept}
            className="flex flex-[2] items-center justify-center gap-1.5 bg-primary py-3 text-sm font-semibold text-white active:opacity-90 disabled:opacity-50"
          >
            <ThumbsUp className="h-4 w-4" />
            {busy ? "กำลังบันทึก…" : "รับงาน"}
          </button>
        ) : !done && job.status !== "in_progress" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus("in_progress")}
            className="flex flex-1 items-center justify-center gap-1.5 bg-card py-3 text-sm font-medium text-primary active:bg-muted disabled:opacity-50"
          >
            <PlayCircle className="h-4 w-4" />
            {busy ? "กำลังบันทึก…" : "เริ่มงาน"}
          </button>
        ) : null}
      </div>

      {/* Closing the job is the last thing that happens on site and the thing a
          thumb is reaching for, so it gets the bottom of the card to itself
          rather than a third of a row shared with the phone. Under the
          signature, because that is the order the two happen in. */}
      {needsAccept || done ? null : (
        <button
          type="button"
          disabled={busy}
          onClick={() => (signed ? onStatus("completed") : onSign())}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-b-lg border-t border-border py-4 text-base font-semibold text-white disabled:opacity-50",
            signed
              ? "bg-emerald-600 active:bg-emerald-700"
              : "bg-slate-500 active:bg-slate-600"
          )}
        >
          {signed ? <CheckCircle2 className="h-5 w-5" /> : <PenLine className="h-5 w-5" />}
          {busy ? "กำลังบันทึก…" : signed ? "ปิดงาน" : "ขอลายเซ็นก่อนปิดงาน"}
        </button>
      )}
    </div>
  );
}
