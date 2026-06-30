"use client";

import { useEffect, useState, useTransition } from "react";
import type { WorkOrder } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { WO_PRIORITIES, WO_STATUSES, WO_TYPES } from "./constants";
import { saveWorkOrder } from "./actions";

export type Option = { id: string; name: string };

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

const blank = {
  title: "",
  type: "installation",
  status: "new",
  priority: "normal",
  technician_id: "",
  company_id: "",
  contact_id: "",
  scheduled_start: "",
  scheduled_end: "",
  site_address: "",
  site_map_url: "",
  description: "",
};

export function WorkOrderModal({
  open,
  onClose,
  editing,
  technicians,
  companies,
  contacts,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: WorkOrder | null;
  technicians: Option[];
  companies: Option[];
  contacts: Option[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      editing
        ? {
            title: editing.title,
            type: editing.type,
            status: editing.status,
            priority: editing.priority,
            technician_id: editing.technician_id || "",
            company_id: editing.company_id || "",
            contact_id: editing.contact_id || "",
            scheduled_start: toLocalInput(editing.scheduled_start),
            scheduled_end: toLocalInput(editing.scheduled_end),
            site_address: editing.site_address || "",
            site_map_url: editing.site_map_url || "",
            description: editing.description || "",
          }
        : blank
    );
  }, [open, editing]);

  function set<K extends keyof typeof blank>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveWorkOrder({
        id: editing?.id,
        title: form.title,
        type: form.type as WorkOrder["type"],
        status: form.status as WorkOrder["status"],
        priority: form.priority as WorkOrder["priority"],
        technician_id: form.technician_id || null,
        company_id: form.company_id || null,
        contact_id: form.contact_id || null,
        scheduled_start: form.scheduled_start || null,
        scheduled_end: form.scheduled_end || null,
        site_address: form.site_address,
        site_map_url: form.site_map_url,
        description: form.description,
      });
      if (!res.ok) return setError(res.error);
      onSaved();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "แก้ไขใบสั่งงาน" : "สร้างใบสั่งงาน"}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div>
          <Label htmlFor="title">ชื่องาน *</Label>
          <Input
            id="title"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="เช่น ติดตั้งโซลาร์ 10kW อาคาร A"
            required
            autoFocus
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="type">ประเภทงาน</Label>
            <Select id="type" value={form.type} onChange={(e) => set("type", e.target.value)}>
              {WO_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="status">สถานะ</Label>
            <Select id="status" value={form.status} onChange={(e) => set("status", e.target.value)}>
              {WO_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="priority">ความสำคัญ</Label>
            <Select
              id="priority"
              value={form.priority}
              onChange={(e) => set("priority", e.target.value)}
            >
              {WO_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="technician_id">ช่างผู้รับผิดชอบ</Label>
            <Select
              id="technician_id"
              value={form.technician_id}
              onChange={(e) => set("technician_id", e.target.value)}
            >
              <option value="">— ยังไม่มอบหมาย —</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="company_id">ลูกค้า (บริษัท)</Label>
            <Select
              id="company_id"
              value={form.company_id}
              onChange={(e) => set("company_id", e.target.value)}
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
              onChange={(e) => set("contact_id", e.target.value)}
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="scheduled_start">นัดหมายเริ่ม</Label>
            <Input
              id="scheduled_start"
              type="datetime-local"
              value={form.scheduled_start}
              onChange={(e) => set("scheduled_start", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="scheduled_end">สิ้นสุด (ถ้ามี)</Label>
            <Input
              id="scheduled_end"
              type="datetime-local"
              value={form.scheduled_end}
              onChange={(e) => set("scheduled_end", e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="site_address">ที่อยู่หน้างาน</Label>
          <Input
            id="site_address"
            value={form.site_address}
            onChange={(e) => set("site_address", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="site_map_url">ลิงก์แผนที่ (Google Maps)</Label>
          <Input
            id="site_map_url"
            value={form.site_map_url}
            onChange={(e) => set("site_map_url", e.target.value)}
            placeholder="https://maps.google.com/…"
          />
        </div>
        <div>
          <Label htmlFor="description">รายละเอียดงาน</Label>
          <Textarea
            id="description"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "สร้างใบสั่งงาน"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
