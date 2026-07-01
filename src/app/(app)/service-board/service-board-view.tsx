"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, ClipboardList, Repeat, Wrench } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { statusMeta, woCode, jobClassLabel, billingMeta } from "../work-orders/constants";

type Board = { value: string; label: string };
type WO = {
  id: string;
  number: number | null;
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

const fmt = (d: string) => {
  const dt = new Date(d + (d.length <= 10 ? "T00:00:00" : ""));
  if (Number.isNaN(dt.getTime())) return d;
  return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear() + 543}`;
};
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
              {boardVisits.map((v) => {
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
                      {fmt(v.due_date)}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Open work orders */}
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Wrench className="h-4 w-4 text-primary" /> งานบริการที่เปิดอยู่ ({boardWOs.length})
          </div>
          {boardWOs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">ไม่มีงานที่เปิดอยู่</p>
          ) : (
            <ul className="space-y-2">
              {boardWOs.map((w) => {
                const s = statusMeta(w.status as never);
                const bm = w.billing ? billingMeta(w.billing) : undefined;
                return (
                  <li key={w.id} className="rounded-md border border-border px-3 py-2">
                    <Link href={`/work-orders/${w.id}`} className="block">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {woCode(w.number)}
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
                          w.scheduled_start ? fmt(w.scheduled_start.slice(0, 10)) : null,
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
        </section>
      </div>
    </div>
  );
}
