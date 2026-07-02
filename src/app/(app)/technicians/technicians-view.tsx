"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HardHat, Mail, Pencil, Phone, Plus, Search, Trash2, UserCog, Users } from "lucide-react";
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
import {
  useDataTable,
  DataTableHead,
  DataTableFilterToggle,
  type ColumnDef,
} from "@/components/ui/data-table";
import { cn } from "@/lib/utils";
import { saveTechnician, deleteTechnician, importTechniciansFromUsers } from "./actions";

const SKILLS = [
  "ATG", "Solar", "EV", "POS", "Tire Inflator", "Pump",
  "Loading Arm", "Tank Truck", "Civil", "Elec", "Tank Test", "Dispensor",
];

const EMPTY = {
  name: "",
  nickname: "",
  email: "",
  phone: "",
  skills: [] as string[],
  active: "true",
};

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
        (t.nickname || "").toLowerCase().includes(q) ||
        (t.skills || []).some((s) => s.toLowerCase().includes(q))
    );
  }, [technicians, query]);

  const columns = useMemo<ColumnDef<Technician>[]>(
    () => [
      {
        key: "name",
        header: "ชื่อ",
        sortAccessor: (t) => t.name,
        filter: { kind: "text", accessor: (t) => t.name },
      },
      {
        key: "skills",
        header: "ความชำนาญ",
        filter: {
          kind: "select",
          accessor: (t) => t.skills ?? [],
          options: SKILLS.map((s) => ({ value: s, label: s })),
        },
      },
      {
        key: "contact",
        header: "ติดต่อ",
        sortAccessor: (t) => t.phone,
        filter: { kind: "text", accessor: (t) => `${t.phone || ""} ${t.email || ""}` },
      },
      {
        key: "active",
        header: "สถานะ",
        sortAccessor: (t) => (t.active ? "1" : "0"),
        filter: {
          kind: "select",
          accessor: (t) => (t.active ? "1" : "0"),
          options: [
            { value: "1", label: "ใช้งาน" },
            { value: "0", label: "พักงาน" },
          ],
        },
      },
      { key: "_actions", header: "" },
    ],
    []
  );
  const table = useDataTable(filtered, columns, {
    initialSort: { key: "name", dir: "asc" },
  });

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
      nickname: t.nickname || "",
      email: t.email || "",
      phone: t.phone || "",
      skills: t.skills || [],
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
        nickname: form.nickname,
        email: form.email,
        phone: form.phone,
        skills: form.skills,
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
  function toggleSkill(s: string) {
    setForm((f) => ({
      ...f,
      skills: f.skills.includes(s)
        ? f.skills.filter((x) => x !== s)
        : [...f.skills, s],
    }));
  }
  function importUsers() {
    startTransition(async () => {
      const res = await importTechniciansFromUsers();
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <PageHeader title="ช่าง" subtitle="ทีมช่างเทคนิคสำหรับงานบริการภาคสนาม">
        <Button variant="secondary" onClick={importUsers} disabled={pending}>
          <Users className="h-4 w-4" /> ดึงช่างจากผู้ใช้ Technician
        </Button>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> เพิ่มช่าง
        </Button>
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาช่าง…"
            className="pl-9"
          />
        </div>
        <DataTableFilterToggle table={table} />
      </div>

      {table.rows.length === 0 ? (
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
            <DataTableHead
              table={table}
              sourceRows={technicians}
              headClassName="uppercase tracking-wide"
            />
            <tbody>
              {table.rows.map((t) => (
                <tr
                  key={t.id}
                  className="group border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={t.nickname || t.name} text={t.nickname || undefined} />
                      <div>
                        <span className="font-medium">{t.name}</span>
                        {t.user_id ? (
                          <span className="ml-2 inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                            <UserCog className="h-3 w-3" /> บัญชีผู้ใช้
                          </span>
                        ) : null}
                        {t.nickname ? (
                          <div className="text-xs text-muted-foreground">({t.nickname})</div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {t.skills && t.skills.length ? (
                      <div className="flex flex-wrap gap-1">
                        {t.skills.map((s) => (
                          <Badge key={s} tone="primary">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
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
          <div className="grid grid-cols-[1fr_140px] gap-3">
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
            <div>
              <Label htmlFor="nickname">ชื่อเล่น</Label>
              <Input
                id="nickname"
                value={form.nickname}
                onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                placeholder="ต้อง"
              />
            </div>
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
          <div>
            <Label>ความชำนาญ (เลือกได้หลายอย่าง)</Label>
            <div className="flex flex-wrap gap-2">
              {SKILLS.map((s) => {
                const on = form.skills.includes(s);
                return (
                  <button
                    type="button"
                    key={s}
                    onClick={() => toggleSkill(s)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      on
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-card text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
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
