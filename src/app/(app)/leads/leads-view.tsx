"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Pencil, Plus, Search, Trash2, UserPlus } from "lucide-react";
import type { Lead, LeadStatus } from "@/lib/database.types";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatCurrency } from "@/lib/utils";
import { saveLead, deleteLead, convertLead } from "./actions";

type Tone = "info" | "primary" | "warning" | "danger" | "success";
const STATUS: { value: LeadStatus; label: string; tone: Tone }[] = [
  { value: "new", label: "ใหม่", tone: "info" },
  { value: "contacted", label: "ติดต่อแล้ว", tone: "primary" },
  { value: "qualified", label: "ผ่านคุณสมบัติ", tone: "warning" },
  { value: "unqualified", label: "ไม่ผ่านคุณสมบัติ", tone: "danger" },
  { value: "converted", label: "แปลงแล้ว", tone: "success" },
];
const statusMeta = (s: LeadStatus) => STATUS.find((x) => x.value === s)!;

const EMPTY = {
  name: "",
  company_name: "",
  email: "",
  phone: "",
  source: "",
  status: "new" as LeadStatus,
  value: "",
  notes: "",
};

export function LeadsView({ leads }: { leads: Lead[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        (l.company_name || "").toLowerCase().includes(q) ||
        (l.email || "").toLowerCase().includes(q)
      );
    });
  }, [leads, query, statusFilter]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  }

  function openEdit(l: Lead) {
    setEditing(l);
    setForm({
      name: l.name,
      company_name: l.company_name || "",
      email: l.email || "",
      phone: l.phone || "",
      source: l.source || "",
      status: l.status,
      value: l.value != null ? String(l.value) : "",
      notes: l.notes || "",
    });
    setError(null);
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveLead({ id: editing?.id, ...form });
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  }

  function remove(l: Lead) {
    if (!confirm(`ลบลูกค้ามุ่งหวัง "${l.name}"?`)) return;
    startTransition(async () => {
      const res = await deleteLead(l.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  function convert(l: Lead) {
    if (
      !confirm(
        `แปลง "${l.name}" เป็นผู้ติดต่อและดีลใหม่? ` +
          (l.company_name ? `และจะสร้างบริษัท "${l.company_name}" ให้ด้วย` : "")
      )
    )
      return;
    startTransition(async () => {
      const res = await convertLead(l.id);
      if (!res.ok) alert(res.error);
      else router.push("/deals");
    });
  }

  return (
    <div>
      <PageHeader
        title="ลูกค้ามุ่งหวัง"
        subtitle="ผู้สนใจที่เข้ามาเพื่อคัดกรองและแปลงเป็นดีล"
      >
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> เพิ่มลูกค้ามุ่งหวัง
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาลูกค้ามุ่งหวัง…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            ทั้งหมด
          </FilterChip>
          {STATUS.map((s) => (
            <FilterChip
              key={s.value}
              active={statusFilter === s.value}
              onClick={() => setStatusFilter(s.value)}
            >
              {s.label}
            </FilterChip>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title={leads.length ? "ไม่พบรายการ" : "ยังไม่มีลูกค้ามุ่งหวัง"}
          description={
            leads.length
              ? "ปรับการค้นหาหรือตัวกรอง"
              : "เพิ่มลูกค้ามุ่งหวังรายแรกแล้วเริ่มคัดกรอง"
          }
          action={
            leads.length ? null : (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" /> เพิ่มลูกค้ามุ่งหวัง
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">ลูกค้ามุ่งหวัง</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3 font-medium">แหล่งที่มา</th>
                <th className="px-4 py-3 font-medium text-right">มูลค่า</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const meta = statusMeta(l.status);
                const converted = l.status === "converted";
                return (
                  <tr
                    key={l.id}
                    className="group border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[l.company_name, l.email].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {l.source || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(l.value)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {!converted ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="แปลงเป็นดีล"
                            onClick={() => convert(l)}
                          >
                            <ArrowRightLeft className="h-4 w-4 text-primary" />
                          </Button>
                        ) : null}
                        <Button variant="ghost" size="icon" onClick={() => openEdit(l)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(l)}>
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
        title={editing ? "แก้ไขลูกค้ามุ่งหวัง" : "เพิ่มลูกค้ามุ่งหวัง"}
      >
        <form onSubmit={submit} className="space-y-4">
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="name">ชื่อ *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="company_name">บริษัท</Label>
              <Input
                id="company_name"
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="email">อีเมล</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="phone">โทรศัพท์</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="status">สถานะ</Label>
              <Select
                id="status"
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as LeadStatus })
                }
              >
                {STATUS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="source">แหล่งที่มา</Label>
              <Input
                id="source"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                placeholder="เว็บไซต์, แนะนำต่อ…"
              />
            </div>
            <div>
              <Label htmlFor="value">มูลค่าโดยประมาณ</Label>
              <Input
                id="value"
                type="number"
                min="0"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            </div>
          </div>
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
              {pending ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มลูกค้ามุ่งหวัง"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function FilterChip({
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
