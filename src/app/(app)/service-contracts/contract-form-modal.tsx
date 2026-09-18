"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ServiceContract, ServiceType } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { SERVICE_BOARDS } from "@/lib/departments";
import { sitesOf, withCompany, withSite } from "@/lib/linked-pickers";
import { SERVICE_TYPES } from "./constants";
import { saveContract } from "./actions";

export type Option = { id: string; name: string };
export type SiteOption = Option & { company_id: string | null };

/**
 * The contract form, in a modal, for wherever a contract gets written:
 * the list (create or edit a row) and the contract's own page (edit this one).
 *
 * One component rather than two copies, because the form is a hundred and
 * seventy lines with a dozen fields and the two would drift within a month.
 * The `initial` seed lets a page open it already pointed at a site.
 */
export function ContractFormModal({
  open,
  onClose,
  editing,
  initial,
  companies,
  sites,
  technicians,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** The contract being edited, or null to create one. */
  editing: ServiceContract | null;
  /** Fields to start a new contract with — a site, its customer. */
  initial?: { site_id?: string; company_id?: string };
  companies: Option[];
  sites: SiteOption[];
  technicians: Option[];
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const today = new Date().toISOString().slice(0, 10);
  const EMPTY = {
    title: "",
    company_id: initial?.company_id ?? "",
    site_id: initial?.site_id ?? "",
    service_type: "panel_cleaning" as ServiceType,
    start_date: today,
    // Blank on purpose: it is a question, not a default. See the field.
    first_visit_date: "",
    frequency_per_year: "2",
    duration_years: "5",
    technician_id: "",
    board_key: "",
    notes: "",
  };
  const fromContract = (c: ServiceContract) => ({
    title: c.title,
    company_id: c.company_id || "",
    site_id: c.site_id || "",
    service_type: c.service_type,
    start_date: c.start_date,
    first_visit_date: c.first_visit_date ?? c.start_date,
    frequency_per_year: String(c.frequency_per_year),
    duration_years: String(c.duration_years),
    technician_id: c.technician_id || "",
    board_key: c.board_key || "",
    notes: c.notes || "",
  });
  const [form, setForm] = useState(() =>
    editing ? fromContract(editing) : EMPTY,
  );

  // Every opening starts from what it is for: the row being edited, or a
  // blank form seeded with wherever the page pointed it. Reset in render
  // rather than in an effect so the first paint is already right.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const key = open ? `${editing?.id ?? "new"}|${initial?.site_id ?? ""}` : null;
  if (key !== openedFor) {
    setOpenedFor(key);
    if (key !== null) {
      setForm(editing ? fromContract(editing) : EMPTY);
      setError(null);
    }
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
        first_visit_date: form.first_visit_date || null,
        frequency_per_year: form.frequency_per_year,
        duration_years: form.duration_years,
        technician_id: form.technician_id || null,
        board_key: form.board_key || null,
        notes: form.notes,
      });
      if (!res.ok) return setError(res.error);
      onClose();
      onSaved?.(res.id ?? editing?.id ?? "");
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "แก้ไขสัญญาบริการ" : "สร้างสัญญาบริการ"}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div>
          <Label htmlFor="title">ชื่อสัญญา *</Label>
          <Input
            id="title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="เช่น Solar PM 5Y"
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
                setForm({
                  ...form,
                  service_type: e.target.value as ServiceType,
                })
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
            <Combobox
              id="technician_id"
              value={form.technician_id}
              onChange={(v) => setForm({ ...form, technician_id: v })}
              placeholder="— ไม่ระบุ —"
              options={technicians.map((t) => ({ value: t.id, label: t.name }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="company_id">นิติบุคคล (ลูกค้า)</Label>
            <Combobox
              id="company_id"
              value={form.company_id}
              onChange={(company_id) =>
                setForm(withCompany(form, company_id, sites))
              }
              placeholder="— ไม่ระบุ —"
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>
          <div>
            <Label htmlFor="site_id">ไซต์งาน</Label>
            {/* Either order: a customer narrows this to their sites, a site
                fills the customer in. */}
            <Combobox
              id="site_id"
              value={form.site_id}
              onChange={(site_id) => setForm(withSite(form, site_id, sites))}
              placeholder={
                form.company_id ? "— เลือกไซต์ของลูกค้านี้ —" : "— ไม่ระบุ —"
              }
              options={sitesOf(sites, form.company_id, form.site_id).map(
                (s) => ({
                  value: s.id,
                  label: s.name,
                }),
              )}
            />
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
            {SERVICE_BOARDS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            เลือกบอร์ดเพื่อให้รอบบริการของสัญญานี้แสดงในหน้า Service Board
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="start_date">วันที่เริ่มสัญญา</Label>
            <Input
              id="start_date"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </div>
          <div>
            {/* Asked, not assumed. Nobody cleans the panels on the day the
                paperwork is signed; the first visit is agreed with the
                customer, and every later round is counted from it. */}
            <Label htmlFor="first_visit_date">วันที่เข้าบริการครั้งแรก</Label>
            <Input
              id="first_visit_date"
              type="date"
              required
              min={form.start_date || undefined}
              value={form.first_visit_date}
              onChange={(e) =>
                setForm({ ...form, first_visit_date: e.target.value })
              }
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="frequency_per_year">ครั้ง/ปี</Label>
            <Input
              id="frequency_per_year"
              type="number"
              min="1"
              value={form.frequency_per_year}
              onChange={(e) =>
                setForm({ ...form, frequency_per_year: e.target.value })
              }
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
              onChange={(e) =>
                setForm({ ...form, duration_years: e.target.value })
              }
            />
          </div>
        </div>
        {!editing ? (
          <p className="rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
            ระบบจะสร้างรอบเข้าบริการ{" "}
            {Math.max(
              1,
              Math.round(
                Number(form.frequency_per_year || 0) *
                  Number(form.duration_years || 0),
              ),
            )}{" "}
            ครั้ง — รอบแรกตรงกับวันที่เข้าบริการครั้งแรก ที่เหลือนับต่อไปทุก{" "}
            {Math.max(1, Math.round(12 / Number(form.frequency_per_year || 1)))}{" "}
            เดือน และแก้วันของแต่ละรอบทีหลังได้ในหน้าสัญญา
          </p>
        ) : (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            ถ้าเปลี่ยนวันเข้าบริการครั้งแรก ความถี่ หรือระยะเวลา
            รอบที่ยังไม่ได้เข้าบริการจะถูกจัดตารางใหม่
            (รอบที่เข้าบริการแล้วคงเดิม)
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
          <Button type="button" variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? "กำลังบันทึก…"
              : editing
                ? "บันทึกการแก้ไข"
                : "สร้างสัญญา"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
