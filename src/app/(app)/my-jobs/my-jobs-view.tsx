"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  ChevronRight,
  ClipboardList,
  MapPin,
  Navigation,
  Phone,
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
import { acceptWorkOrder, updateWorkOrderStatus } from "../work-orders/actions";

export type Job = {
  id: string;
  number: number | null;
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
}: {
  jobs: Job[];
  technicianName: string | null;
  linked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

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
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({
  job,
  busy,
  onStatus,
  onAccept,
}: {
  job: Job;
  busy: boolean;
  onStatus: (s: WorkOrderStatus) => void;
  onAccept: () => void;
}) {
  const st = statusMeta(job.status);
  const pr = priorityMeta(job.priority);
  const done = DONE.includes(job.status);
  const needsAccept = !done && !job.accepted_at;
  // The person on site beats the company switchboard.
  const callNumber = job.contactPhone ?? job.companyPhone;

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <Link href={`/work-orders/${job.id}`} className="block p-4 active:bg-muted/40">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs text-muted-foreground">{woCode(job.number)}</span>
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

      {/* Field actions — big tap targets, no page change needed. */}
      <div className="flex items-stretch gap-px border-t border-border bg-border">
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
        ) : !done ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onStatus(job.status === "in_progress" ? "completed" : "in_progress")
            }
            className="flex flex-1 items-center justify-center gap-1.5 bg-card py-3 text-sm font-medium text-primary active:bg-muted disabled:opacity-50"
          >
            <PlayCircle className="h-4 w-4" />
            {busy ? "กำลังบันทึก…" : job.status === "in_progress" ? "ปิดงาน" : "เริ่มงาน"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
