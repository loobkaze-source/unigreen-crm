"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Repeat, Search, Trash2 } from "lucide-react";
import type { ServiceContract, ServiceType } from "@/lib/database.types";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useDataTable,
  DataTableHead,
  DataTableFilterToggle,
  type ColumnDef,
} from "@/components/ui/data-table";
import { DEPARTMENTS } from "@/lib/departments";
import { fmtDate } from "@/lib/format";
import { SERVICE_TYPES, serviceTypeLabel } from "./constants";
import { saveContract, deleteContract } from "./actions";

type Option = { id: string; name: string };
type ContractRow = ServiceContract & {
  total: number;
  done: number;
  nextDue: string | null;
};

export function ContractsView({
  contracts,
  companies,
  sites,
  technicians,
}: {
  contracts: ContractRow[];
  companies: Option[];
  sites: Option[];
  technicians: Option[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceContract | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const companyName = useMemo(() => {
    const m = new Map(companies.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? m.get(id) : undefined);
  }, [companies]);
  const siteName = useMemo(() => {
    const m = new Map(sites.map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? m.get(id) : undefined);
  }, [sites]);

  const today = new Date().toISOString().slice(0, 10);
  const EMPTY = {
    title: "",
    company_id: "",
    site_id: "",
    service_type: "panel_cleaning" as ServiceType,
    start_date: today,
    frequency_per_year: "2",
    duration_years: "5",
    technician_id: "",
    board_key: "",
    notes: "",
  };
  const [form, setForm] = useState(EMPTY);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contracts;
    return contracts.filter((c) => c.title.toLowerCase().includes(q));
  }, [contracts, query]);

  const columns = useMemo<ColumnDef<ContractRow>[]>(
    () => [
      {
        key: "title",
        header: "สัญญา",
        sortAccessor: (c) => c.title,
        filter: {
          kind: "select",
          accessor: (c) => c.service_type,
          options: SERVICE_TYPES.map((s) => ({ value: s.value, label: s.label })),
        },
      },
      {
        key: "frequency",
        header: "รอบ",
        sortAccessor: (c) => c.frequency_per_year,
      },
      {
        key: "progress",
        header: "ความคืบหน้า",
        sortAccessor: (c) => (c.total ? c.done / c.total : 0),
      },
      {
        key: "nextDue",
        header: "รอบถัดไป",
        sortAccessor: (c) => c.nextDue,
      },
      { key: "_actions", header: "" },
    ],
    []
  );
  const table = useDataTable(filtered, columns, {
    initialSort: { key: "nextDue", dir: "asc" },
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  }
  function openEdit(c: ServiceContract, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setEditing(c);
    setForm({
      title: c.title,
      company_id: c.company_id || "",
      site_id: c.site_id || "",
      service_type: c.service_type,
      start_date: c.start_date,
      frequency_per_year: String(c.frequency_per_year),
      duration_years: String(c.duration_years),
      technician_id: c.technician_id || "",
      board_key: c.board_key || "",
      notes: c.notes || "",
    });
    setError(null);
    setOpen(true);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveContract({
        id: editing?.id,
        title: form.title,
        company_id: form.company_id || null,
        site_id: form.site_id || null,
        service_type: form.service_type,
        start_date: form.start_date,
        frequency_per_year: form.frequency_per_year,
        duration_years: form.duration_years,
        technician_id: form.technician_id || null,
        board_key: form.board_key || null,
        notes: form.notes,
      });
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  }
  function remove(c: ServiceContract, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`ลบสัญญา "${c.title}"? รอบเข้าบริการทั้งหมดจะถูกลบด้วย`)) return;
    startTransition(async () => {
      const res = await deleteContract(c.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <PageHeader
        title="สัญญาบริการ"
        subtitle="สัญญาดูแลรายปี เช่น ล้างแผงโซลาร์ / ล้างฟิลเตอร์ EV — กำหนดรอบและติดตามจำนวนครั้งที่เข้าบริการ"
      >
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> สร้างสัญญา
        </Button>
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาสัญญา…"
            className="pl-9"
          />
        </div>
        <DataTableFilterToggle table={table} />
      </div>

      {table.rows.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title={contracts.length ? "ไม่พบรายการ" : "ยังไม่มีสัญญาบริการ"}
          description={
            contracts.length
              ? "ลองค้นด้วยคำอื่น"
              : "สร้างสัญญาบริการรายปี ระบบจะสร้างรอบเข้าบริการตามความถี่ให้อัตโนมัติ"
          }
          action={
            contracts.length ? null : (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" /> สร้างสัญญา
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <DataTableHead
              table={table}
              sourceRows={contracts}
              headClassName="uppercase tracking-wide"
            />
            <tbody>
              {table.rows.map((c) => {
                const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
                const overdue = c.nextDue && c.nextDue < today;
                return (
                  <tr
                    key={c.id}
                    className="group border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/service-contracts/${c.id}`} className="block">
                        <div className="font-medium hover:text-primary">{c.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {[serviceTypeLabel(c.service_type), companyName(c.company_id), siteName(c.site_id)]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      ปีละ {c.frequency_per_year} ครั้ง · {c.duration_years} ปี
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {c.done}/{c.total}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.nextDue ? (
                        <span
                          className={
                            overdue ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"
                          }
                        >
                          {fmtDate(c.nextDue)}
                        </span>
                      ) : (
                        <Badge tone="success">ครบแล้ว</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="icon" onClick={(e) => openEdit(c, e)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={(e) => remove(c, e)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "แก้ไขสัญญาบริการ" : "สร้างสัญญาบริการ"}
        size="lg"
      >
        <form onSubmit={submit} className="space-y-4">
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
          <div>
            <Label htmlFor="title">ชื่อสัญญา *</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="เช่น สัญญาล้างแผงโซลาร์ 5 ปี"
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="service_type">ประเภทบริการ</Label>
              <Select
                id="service_type"
                value={form.service_type}
                onChange={(e) =>
                  setForm({ ...form, service_type: e.target.value as ServiceType })
                }
              >
                {SERVICE_TYPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="technician_id">ช่างประจำ</Label>
              <Select
                id="technician_id"
                value={form.technician_id}
                onChange={(e) => setForm({ ...form, technician_id: e.target.value })}
              >
                <option value="">— ไม่ระบุ —</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="company_id">นิติบุคคล (ลูกค้า)</Label>
              <Select
                id="company_id"
                value={form.company_id}
                onChange={(e) => setForm({ ...form, company_id: e.target.value })}
              >
                <option value="">— ไม่ระบุ —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="site_id">ไซต์งาน</Label>
              <Select
                id="site_id"
                value={form.site_id}
                onChange={(e) => setForm({ ...form, site_id: e.target.value })}
              >
                <option value="">— ไม่ระบุ —</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="board_key">Service Board</Label>
            <Select
              id="board_key"
              value={form.board_key}
              onChange={(e) => setForm({ ...form, board_key: e.target.value })}
            >
              <option value="">— ไม่ระบุ —</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              เลือกบอร์ดเพื่อให้รอบบริการของสัญญานี้แสดงในหน้า Service Board
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="start_date">วันที่เริ่ม</Label>
              <Input
                id="start_date"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="frequency_per_year">ครั้ง/ปี</Label>
              <Input
                id="frequency_per_year"
                type="number"
                min="1"
                value={form.frequency_per_year}
                onChange={(e) => setForm({ ...form, frequency_per_year: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="duration_years">ระยะเวลา (ปี)</Label>
              <Input
                id="duration_years"
                type="number"
                min="1"
                step="0.5"
                value={form.duration_years}
                onChange={(e) => setForm({ ...form, duration_years: e.target.value })}
              />
            </div>
          </div>
          {!editing ? (
            <p className="rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
              ระบบจะสร้างรอบเข้าบริการ{" "}
              {Math.max(
                1,
                Math.round(Number(form.frequency_per_year || 0) * Number(form.duration_years || 0))
              )}{" "}
              ครั้งให้อัตโนมัติตามความถี่ที่กำหนด
            </p>
          ) : (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              การแก้ไขจะไม่สร้างรอบใหม่ (รอบที่สร้างไว้แล้วยังคงอยู่)
            </p>
          )}
          <div>
            <Label htmlFor="notes">หมายเหตุ</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "สร้างสัญญา"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
