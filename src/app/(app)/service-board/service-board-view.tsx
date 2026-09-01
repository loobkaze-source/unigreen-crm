"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, ClipboardList, Repeat, Wrench } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { statusMeta, woCode, jobClassLabel, billingMeta } from "../work-orders/constants";

type Board = { value: string; label: string };
type WO = {
  id: string;
  number: number | null;
  report_no: string | null;
  title: string;
  status: string;
  board_key: string | null;
  scheduled_start: string | null;
  job_class: string | null;
  billing: string | null;
  technician_id: string | null;
};
type Contract = { id: string; title: string; board_key: string | null; site_id: string | null };
type Visit = { id: string; contract_id: string; seq: number; due_date: string };
type Tech = { id: string; name: string; nickname: string | null };

/**
 * How much of each list is shown at once.
 *
 * A board can carry hundreds of rounds — every one of them a row with a link
 * in it — and nobody scrolls to the four-hundredth. Twenty is a screenful;
 * a hundred is as far as this page is worth taking, and past that the
 * contracts and work-order pages are the ones with the filters.
 */
const PAGE = 20;
const MAX = 100;

const isOverdue = (d: string) => {
  const dt = new Date(d + (d.length <= 10 ? "T00:00:00" : ""));
  return !Number.isNaN(dt.getTime()) && dt.getTime() < Date.now();
};

export function ServiceBoardView({
  boards,
  workOrders,
  contracts,
  visits,
  technicians,
}: {
  boards: Board[];
  workOrders: WO[];
  contracts: Contract[];
  visits: Visit[];
  technicians: Tech[];
}) {
  const [active, setActive] = useState<string>(boards[0]?.value ?? "");
  const [visitLimit, setVisitLimit] = useState(PAGE);
  const [woLimit, setWoLimit] = useState(PAGE);
  // Switching department starts both lists over — carrying a "showing 100"
  // into a board with six rows on it just looks broken.
  const [shownFor, setShownFor] = useState(active);
  if (shownFor !== active) {
    setShownFor(active);
    setVisitLimit(PAGE);
    setWoLimit(PAGE);
  }

  const contractMap = useMemo(
    () => new Map(contracts.map((c) => [c.id, c])),
    [contracts]
  );
  const techName = useMemo(() => {
    const m = new Map(technicians.map((t) => [t.id, t.nickname || t.name]));
    return (id: string | null) => (id ? m.get(id) : undefined);
  }, [technicians]);

  const boardVisits = useMemo(
    () =>
      visits.filter((v) => contractMap.get(v.contract_id)?.board_key === active),
    [visits, contractMap, active]
  );
  const boardWOs = useMemo(
    () => workOrders.filter((w) => w.board_key === active),
    [workOrders, active]
  );

  const countFor = (key: string) => {
    const v = visits.filter((x) => contractMap.get(x.contract_id)?.board_key === key).length;
    const w = workOrders.filter((x) => x.board_key === key).length;
    return v + w;
  };

  if (boards.length === 0) {
    return (
      <div>
        <PageHeader title="Service Board" subtitle="ติดตามงานบริการและสัญญาที่กำลังจะถึง" />
        <EmptyState
          icon={ClipboardList}
          title="ยังไม่ได้รับมอบหมาย Service Board"
          description="ผู้ดูแลระบบยังไม่ได้เพิ่มคุณเข้าบอร์ดบริการใด — ไปที่ ตั้งค่า → Service Board เพื่อมอบหมาย"
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Service Board"
        subtitle="ติดตามงานบริการที่เปิดอยู่ และรอบบริการตามสัญญาที่กำลังจะถึง"
      />

      {/* Board tabs */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {boards.map((b) => (
          <button
            key={b.value}
            onClick={() => setActive(b.value)}
            className={cn(
              "relative -mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              active === b.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {b.label}
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {countFor(b.value)}
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming service visits */}
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Repeat className="h-4 w-4 text-primary" /> รอบบริการที่จะถึง ({boardVisits.length})
          </div>
          {boardVisits.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">ไม่มีรอบบริการค้าง</p>
          ) : (
            <ul className="space-y-2">
              {boardVisits.slice(0, visitLimit).map((v) => {
                const c = contractMap.get(v.contract_id);
                const overdue = isOverdue(v.due_date);
                return (
                  <li
                    key={v.id}
                    className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <CalendarClock
                      className={cn("h-4 w-4", overdue ? "text-destructive" : "text-muted-foreground")}
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/service-contracts/${v.contract_id}`}
                        className="truncate text-sm font-medium hover:text-primary"
                      >
                        {c?.title || "สัญญาบริการ"}
                      </Link>
                      <div className="text-xs text-muted-foreground">รอบที่ {v.seq}</div>
                    </div>
                    <Badge tone={overdue ? "danger" : "info"}>
                      {overdue ? "เลยกำหนด " : "ครบกำหนด "}
                      {fmtDate(v.due_date)}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
          <ShowMore
            shown={Math.min(visitLimit, boardVisits.length)}
            total={boardVisits.length}
            onMore={() => setVisitLimit((n) => Math.min(n + PAGE, MAX))}
            restHref="/service-contracts"
            restLabel="ดูทั้งหมดที่สัญญาบริการ"
          />
        </section>

        {/* Open work orders */}
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Wrench className="h-4 w-4 text-primary" /> ใบงานที่เปิดอยู่ ({boardWOs.length})
          </div>
          {boardWOs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">ไม่มีงานที่เปิดอยู่</p>
          ) : (
            <ul className="space-y-2">
              {boardWOs.slice(0, woLimit).map((w) => {
                const s = statusMeta(w.status as never);
                const bm = w.billing ? billingMeta(w.billing) : undefined;
                return (
                  <li key={w.id} className="rounded-md border border-border px-3 py-2">
                    <Link href={`/work-orders/${w.id}`} className="block">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {woCode(w)}
                        </span>
                        <Badge tone={s.tone}>{s.label}</Badge>
                        {w.job_class ? <Badge tone="info">{jobClassLabel(w.job_class)}</Badge> : null}
                        {bm ? <Badge tone={bm.tone}>{bm.label}</Badge> : null}
                      </div>
                      <div className="mt-0.5 truncate text-sm font-medium hover:text-primary">
                        {w.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[
                          w.scheduled_start ? fmtDate(w.scheduled_start.slice(0, 10)) : null,
                          techName(w.technician_id),
                        ]
                          .filter(Boolean)
                          .join(" · ") || "ยังไม่นัดหมาย"}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <ShowMore
            shown={Math.min(woLimit, boardWOs.length)}
            total={boardWOs.length}
            onMore={() => setWoLimit((n) => Math.min(n + PAGE, MAX))}
            restHref="/work-orders"
            restLabel="ดูทั้งหมดที่ใบงาน"
          />
        </section>
      </div>
    </div>
  );
}

/**
 * The foot of a board list: how much of it is on screen, and the way to see
 * more of it.
 *
 * Silent when the whole list already fits, because a button that does nothing
 * is worse than no button. At the hundred-row ceiling it stops offering and
 * points at the page that can actually search the rest.
 */
function ShowMore({
  shown,
  total,
  onMore,
  restHref,
  restLabel,
}: {
  shown: number;
  total: number;
  onMore: () => void;
  restHref: string;
  restLabel: string;
}) {
  if (total <= shown) return null;
  const capped = shown >= MAX;
  return (
    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs">
      <span className="text-muted-foreground">
        แสดง {shown} จาก {total}
      </span>
      {capped ? (
        <Link href={restHref} className="font-medium text-primary hover:underline">
          {restLabel}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onMore}
          className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-muted"
        >
          แสดงเพิ่ม (+{Math.min(PAGE, Math.min(total, MAX) - shown)})
        </button>
      )}
    </div>
  );
}
