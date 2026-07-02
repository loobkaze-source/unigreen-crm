"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LifeBuoy, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { Case, CaseStatus } from "@/lib/database.types";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { saveCase, deleteCase } from "./actions";

type Option = { id: string; name: string };
type Tone = "info" | "warning" | "success" | "muted";

const STATUS: { value: CaseStatus; label: string; tone: Tone }[] = [
  { value: "open", label: "เปิด", tone: "info" },
  { value: "in_progress", label: "กำลังดำเนินการ", tone: "warning" },
  { value: "closed", label: "ปิดแล้ว", tone: "success" },
];
const statusMeta = (s: CaseStatus) => STATUS.find((x) => x.value === s)!;

export function CasesView({
  cases,
  companies,
  contacts,
  initialQuery = "",
  limitHit = false,
}: {
  cases: Case[];
  companies: Option[];
  contacts: Option[];
  initialQuery?: string;
  limitHit?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  // Mirror the search box into ?q= (debounced) so the server can search the
  // whole table — the list itself is capped to the newest rows.
  const lastPushedQ = useRef(initialQuery);
  useEffect(() => {
    const t = setTimeout(() => {
      const q = query.trim();
      if (q === lastPushedQ.current) return;
      lastPushedQ.current = q;
      router.replace(q ? `/cases?q=${encodeURIComponent(q)}` : "/cases", {
        scroll: false,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [query, router]);
  const [statusFilter, setStatusFilter] = useState<CaseStatus | "all">("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Case | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const EMPTY = {
    subject: "",
    status: "open" as CaseStatus,
    case_type: "",
    case_from: "ลูกค้า",
    employee: "",
    team: "",
    company_id: "",
    contact_id: "",
    case_date: "",
    note: "",
    action: "",
  };
  const [form, setForm] = useState(EMPTY);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cases.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.subject.toLowerCase().includes(q) ||
        (c.employee || "").toLowerCase().includes(q) ||
        (c.note || "").toLowerCase().includes(q)
      );
    });
  }, [cases, query, statusFilter]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  }
  function openEdit(c: Case) {
    setEditing(c);
    setForm({
      subject: c.subject,
      status: c.status,
      case_type: c.case_type || "",
      case_from: c.case_from || "",
      employee: c.employee || "",
      team: c.team || "",
      company_id: c.company_id || "",
      contact_id: c.contact_id || "",
      case_date: c.case_date ? c.case_date.slice(0, 16) : "",
      note: c.note || "",
      action: c.action || "",
    });
    setError(null);
    setOpen(true);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveCase({
        id: editing?.id,
        ...form,
        company_id: form.company_id || null,
        contact_id: form.contact_id || null,
        case_date: form.case_date || null,
      });
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  }
  function remove(c: Case) {
    if (!confirm(`ลบเคส "${c.subject}"?`)) return;
    startTransition(async () => {
      const res = await deleteCase(c.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: cases.length };
    STATUS.forEach((s) => (m[s.value] = cases.filter((c) => c.status === s.value).length));
    return m;
  }, [cases]);

  return (
    <div>
      <PageHeader title="เคส" subtitle="งานบริการ/คำร้องจากลูกค้า (Case Management)">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> เพิ่มเคส
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาเคส…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <Chip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            ทั้งหมด ({counts.all})
          </Chip>
          {STATUS.map((s) => (
            <Chip
              key={s.value}
              active={statusFilter === s.value}
              onClick={() => setStatusFilter(s.value)}
            >
              {s.label} ({counts[s.value]})
            </Chip>
          ))}
        </div>
      </div>

      {limitHit ? (
        <p className="mb-3 text-xs text-muted-foreground">
          แสดงเฉพาะรายการล่าสุด — พิมพ์ค้นหาเพื่อหารายการที่เก่ากว่า
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title={cases.length ? "ไม่พบรายการ" : "ยังไม่มีเคส"}
          description={
            cases.length ? "ปรับการค้นหาหรือตัวกรอง" : "บันทึกคำร้อง/ปัญหาจากลูกค้าเพื่อติดตามการแก้ไข"
          }
          action={
            cases.length ? null : (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" /> เพิ่มเคส
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">เคส</th>
                <th className="px-4 py-3 font-medium">ประเภท</th>
                <th className="px-4 py-3 font-medium">ผู้รับผิดชอบ</th>
                <th className="px-4 py-3 font-medium">วันที่</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const meta = statusMeta(c.status);
                return (
                  <tr
                    key={c.id}
                    className="group border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <button onClick={() => openEdit(c)} className="block text-left">
                        <div className="font-medium hover:text-primary">{c.subject}</div>
                        {c.note ? (
                          <div className="max-w-md truncate text-xs text-muted-foreground">
                            {c.note}
                          </div>
                        ) : null}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.case_type || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.employee || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.case_date
                        ? fmtDate(c.case_date)
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(c)}>
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
        title={editing ? "แก้ไขเคส" : "เพิ่มเคส"}
        size="lg"
      >
        <form onSubmit={submit} className="space-y-4">
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
          <div>
            <Label htmlFor="subject">หัวข้อ *</Label>
            <Input
              id="subject"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="status">สถานะ</Label>
              <Select
                id="status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as CaseStatus })}
              >
                {STATUS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="case_type">ประเภท</Label>
              <Input
                id="case_type"
                value={form.case_type}
                onChange={(e) => setForm({ ...form, case_type: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="case_date">วันที่</Label>
              <Input
                id="case_date"
                type="datetime-local"
                value={form.case_date}
                onChange={(e) => setForm({ ...form, case_date: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="employee">ผู้รับผิดชอบ</Label>
              <Input
                id="employee"
                value={form.employee}
                onChange={(e) => setForm({ ...form, employee: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="team">ทีม</Label>
              <Input
                id="team"
                value={form.team}
                onChange={(e) => setForm({ ...form, team: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="company_id">บริษัท</Label>
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
              <Label htmlFor="contact_id">ผู้ติดต่อ</Label>
              <Select
                id="contact_id"
                value={form.contact_id}
                onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
              >
                <option value="">— ไม่ระบุ —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="note">รายละเอียด</Label>
            <Textarea
              id="note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="action">การดำเนินการ</Label>
            <Textarea
              id="action"
              rows={2}
              value={form.action}
              onChange={(e) => setForm({ ...form, action: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มเคส"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
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
