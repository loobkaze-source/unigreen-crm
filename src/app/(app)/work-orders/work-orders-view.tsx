"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import {
  CalendarClock,
  LayoutList,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wrench,
} from "lucide-react";
import type { WorkOrder, WorkOrderStatus } from "@/lib/database.types";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { WO_STATUSES, priorityMeta, statusMeta, typeLabel, woCode } from "./constants";
import { WorkOrderModal, type Option } from "./work-order-modal";
import { deleteWorkOrder } from "./actions";

export function WorkOrdersView({
  workOrders,
  technicians,
  companies,
  contacts,
}: {
  workOrders: WorkOrder[];
  technicians: Option[];
  companies: Option[];
  contacts: Option[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | "all">("all");
  const [tab, setTab] = useState<"list" | "schedule">("list");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WorkOrder | null>(null);
  const [, startTransition] = useTransition();

  const techName = useMemo(() => {
    const m = new Map(technicians.map((t) => [t.id, t.name]));
    return (id: string | null) => (id ? m.get(id) : undefined);
  }, [technicians]);
  const companyName = useMemo(() => {
    const m = new Map(companies.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? m.get(id) : undefined);
  }, [companies]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workOrders.filter((w) => {
      if (statusFilter !== "all" && w.status !== statusFilter) return false;
      if (!q) return true;
      return (
        w.title.toLowerCase().includes(q) ||
        woCode(w.number).toLowerCase().includes(q) ||
        (w.site_address || "").toLowerCase().includes(q)
      );
    });
  }, [workOrders, query, statusFilter]);

  // Agenda: scheduled grouped by date, then "ยังไม่นัดหมาย"
  const agenda = useMemo(() => {
    const groups = new Map<string, WorkOrder[]>();
    const noDate: WorkOrder[] = [];
    [...filtered]
      .sort((a, b) =>
        (a.scheduled_start || "").localeCompare(b.scheduled_start || "")
      )
      .forEach((w) => {
        if (!w.scheduled_start) return noDate.push(w);
        const key = w.scheduled_start.slice(0, 10);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(w);
      });
    return { groups: [...groups.entries()], noDate };
  }, [filtered]);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(w: WorkOrder, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setEditing(w);
    setOpen(true);
  }
  function remove(w: WorkOrder, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`ลบใบสั่งงาน "${woCode(w.number)} ${w.title}"?`)) return;
    startTransition(async () => {
      const res = await deleteWorkOrder(w.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <PageHeader title="งานบริการ" subtitle="ใบสั่งงานสำรวจ ติดตั้ง และบำรุงรักษาหน้างาน">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> สร้างใบสั่งงาน
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหางาน / เลขที่ / ที่อยู่…"
            className="pl-9"
          />
        </div>
        <div className="flex rounded-md border border-border bg-card p-0.5">
          <TabBtn active={tab === "list"} onClick={() => setTab("list")} icon={LayoutList}>
            รายการ
          </TabBtn>
          <TabBtn active={tab === "schedule"} onClick={() => setTab("schedule")} icon={CalendarClock}>
            กำหนดการ
          </TabBtn>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        <Chip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
          ทั้งหมด
        </Chip>
        {WO_STATUSES.map((s) => (
          <Chip
            key={s.value}
            active={statusFilter === s.value}
            onClick={() => setStatusFilter(s.value)}
          >
            {s.label}
          </Chip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={workOrders.length ? "ไม่พบรายการ" : "ยังไม่มีใบสั่งงาน"}
          description={
            workOrders.length
              ? "ปรับการค้นหาหรือตัวกรอง"
              : "สร้างใบสั่งงานแรกเพื่อมอบหมายงานหน้างานให้ทีมช่าง"
          }
          action={
            workOrders.length ? null : (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" /> สร้างใบสั่งงาน
              </Button>
            )
          }
        />
      ) : tab === "list" ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">เลขที่ / งาน</th>
                <th className="px-4 py-3 font-medium">ประเภท</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3 font-medium">ช่าง</th>
                <th className="px-4 py-3 font-medium">นัดหมาย</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => (
                <WorkOrderRow
                  key={w.id}
                  w={w}
                  techName={techName(w.technician_id)}
                  companyName={companyName(w.company_id)}
                  onEdit={(e) => openEdit(w, e)}
                  onDelete={(e) => remove(w, e)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-6">
          {agenda.groups.map(([date, items]) => (
            <div key={date}>
              <h3 className="mb-2 text-sm font-semibold">
                {format(new Date(date), "EEEE d MMMM", { locale: th })}
              </h3>
              <div className="space-y-2">
                {items.map((w) => (
                  <ScheduleCard
                    key={w.id}
                    w={w}
                    techName={techName(w.technician_id)}
                    companyName={companyName(w.company_id)}
                  />
                ))}
              </div>
            </div>
          ))}
          {agenda.noDate.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                ยังไม่นัดหมาย
              </h3>
              <div className="space-y-2">
                {agenda.noDate.map((w) => (
                  <ScheduleCard
                    key={w.id}
                    w={w}
                    techName={techName(w.technician_id)}
                    companyName={companyName(w.company_id)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <WorkOrderModal
        open={open}
        onClose={() => setOpen(false)}
        editing={editing}
        technicians={technicians}
        companies={companies}
        contacts={contacts}
        onSaved={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function WorkOrderRow({
  w,
  techName,
  companyName,
  onEdit,
  onDelete,
}: {
  w: WorkOrder;
  techName?: string;
  companyName?: string;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const s = statusMeta(w.status);
  const p = priorityMeta(w.priority);
  return (
    <tr className="group border-b border-border last:border-0 hover:bg-muted/30">
      <td className="px-4 py-3">
        <Link href={`/work-orders/${w.id}`} className="block">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {woCode(w.number)}
            </span>
            {w.priority !== "normal" && w.priority !== "low" ? (
              <Badge tone={p.tone}>{p.label}</Badge>
            ) : null}
          </div>
          <div className="font-medium hover:text-primary">{w.title}</div>
          {companyName ? (
            <div className="text-xs text-muted-foreground">{companyName}</div>
          ) : null}
        </Link>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{typeLabel(w.type)}</td>
      <td className="px-4 py-3">
        <Badge tone={s.tone}>{s.label}</Badge>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{techName || "—"}</td>
      <td className="px-4 py-3 text-muted-foreground">
        {w.scheduled_start
          ? format(new Date(w.scheduled_start), "d MMM HH:mm", { locale: th })
          : "—"}
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function ScheduleCard({
  w,
  techName,
  companyName,
}: {
  w: WorkOrder;
  techName?: string;
  companyName?: string;
}) {
  const s = statusMeta(w.status);
  return (
    <Link
      href={`/work-orders/${w.id}`}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="w-14 shrink-0 text-center">
        <div className="text-sm font-semibold">
          {w.scheduled_start
            ? format(new Date(w.scheduled_start), "HH:mm")
            : "--:--"}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {woCode(w.number)}
          </span>
          <Badge tone={s.tone}>{s.label}</Badge>
        </div>
        <div className="truncate font-medium">{w.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {[typeLabel(w.type), companyName, techName].filter(Boolean).join(" · ")}
        </div>
      </div>
    </Link>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-3 py-1 text-sm font-medium transition-colors",
        active ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-white"
          : "border-border bg-card text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}
