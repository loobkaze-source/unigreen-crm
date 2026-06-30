"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HardHat, Mail, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import type { Technician } from "@/lib/database.types";
import { PageHeader } from "@/components/app/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { saveTechnician, deleteTechnician } from "./actions";

const EMPTY = { name: "", email: "", phone: "", skill: "", active: "true" };

export function TechniciansView({ technicians }: { technicians: Technician[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Technician | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return technicians;
    return technicians.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.skill || "").toLowerCase().includes(q)
    );
  }, [technicians, query]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  }
  function openEdit(t: Technician) {
    setEditing(t);
    setForm({
      name: t.name,
      email: t.email || "",
      phone: t.phone || "",
      skill: t.skill || "",
      active: t.active ? "true" : "false",
    });
    setError(null);
    setOpen(true);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveTechnician({
        id: editing?.id,
        name: form.name,
        email: form.email,
        phone: form.phone,
        skill: form.skill,
        active: form.active === "true",
      });
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  }
  function remove(t: Technician) {
    if (!confirm(`ลบช่าง "${t.name}"?`)) return;
    startTransition(async () => {
      const res = await deleteTechnician(t.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <PageHeader title="ช่าง" subtitle="ทีมช่างเทคนิคสำหรับงานบริการภาคสนาม">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> เพิ่มช่าง
        </Button>
      </PageHeader>

      <div className="mb-4 relative max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาช่าง…"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title={technicians.length ? "ไม่พบรายการ" : "ยังไม่มีช่าง"}
          description={
            technicians.length
              ? "ลองค้นด้วยคำอื่น"
              : "เพิ่มช่างเทคนิคเพื่อมอบหมายงานบริการ"
          }
          action={
            technicians.length ? null : (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" /> เพิ่มช่าง
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">ชื่อ</th>
                <th className="px-4 py-3 font-medium">ความชำนาญ</th>
                <th className="px-4 py-3 font-medium">ติดต่อ</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  className="group border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={t.name} />
                      <span className="font-medium">{t.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {t.skill || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div className="flex flex-col gap-0.5 text-xs">
                      {t.phone ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {t.phone}
                        </span>
                      ) : null}
                      {t.email ? (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {t.email}
                        </span>
                      ) : null}
                      {!t.phone && !t.email ? "—" : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {t.active ? (
                      <Badge tone="success">ใช้งาน</Badge>
                    ) : (
                      <Badge tone="muted">พักงาน</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(t)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "แก้ไขช่าง" : "เพิ่มช่าง"}
      >
        <form onSubmit={submit} className="space-y-4">
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div>
            <Label htmlFor="name">ชื่อ-นามสกุล *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="phone">โทรศัพท์</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="email">อีเมล</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="skill">ความชำนาญ</Label>
              <Input
                id="skill"
                value={form.skill}
                onChange={(e) => setForm({ ...form, skill: e.target.value })}
                placeholder="ติดตั้งโซลาร์, EV…"
              />
            </div>
            <div>
              <Label htmlFor="active">สถานะ</Label>
              <Select
                id="active"
                value={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.value })}
              >
                <option value="true">ใช้งาน</option>
                <option value="false">พักงาน</option>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มช่าง"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
