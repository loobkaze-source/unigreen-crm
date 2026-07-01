"use client";

import { useEffect, useState, useTransition } from "react";
import type { WorkOrder } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DEPARTMENTS } from "@/lib/departments";
import { WO_BILLING, WO_JOB_CLASS, WO_PRIORITIES, WO_STATUSES, WO_TYPES } from "./constants";
import { saveWorkOrder } from "./actions";

export type Option = { id: string; name: string };
export type ContactOption = { id: string; name: string; company_id: string | null };
export type CaseOption = { id: string; name: string; company_id: string | null };
export type SiteOption = {
  id: string;
  name: string;
  company_id: string | null;
  address: string | null;
  map_url: string | null;
};
export type AssetOption = { id: string; name: string; site_id: string | null };

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
  job_class: "",
  billing: "",
  board_key: "",
  case_id: "",
  asset_ids: [] as string[],
  technician_id: "",
  company_id: "",
  site_id: "",
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
  sites,
  assets,
  cases,
  assetIds = [],
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: WorkOrder | null;
  technicians: Option[];
  companies: Option[];
  contacts: ContactOption[];
  sites: SiteOption[];
  assets: AssetOption[];
  cases: CaseOption[];
  /** The editing WO's current linked asset ids (empty when creating). */
  assetIds?: string[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [assetQuery, setAssetQuery] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAssetQuery("");
    setForm(
      editing
        ? {
            title: editing.title,
            type: editing.type,
            status: editing.status,
            priority: editing.priority,
            job_class: editing.job_class || "",
            billing: editing.billing || "",
            board_key: editing.board_key || "",
            case_id: editing.case_id || "",
            asset_ids: assetIds,
            technician_id: editing.technician_id || "",
            company_id: editing.company_id || "",
            site_id: editing.site_id || "",
            contact_id: editing.contact_id || "",
            scheduled_start: toLocalInput(editing.scheduled_start),
            scheduled_end: toLocalInput(editing.scheduled_end),
            site_address: editing.site_address || "",
            site_map_url: editing.site_map_url || "",
            description: editing.description || "",
          }
        : blank
    );
  }, [open, editing, assetIds]);

  function set<K extends keyof typeof blank>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // ---- Cascade: customer -> site -> asset --------------------------------
  function selectCompany(id: string) {
    setForm((f) => {
      const keep = sites.find((s) => s.id === f.site_id)?.company_id === id;
      const contactOk = contacts.find((c) => c.id === f.contact_id)?.company_id === id;
      if (keep)
        return { ...f, company_id: id, contact_id: contactOk ? f.contact_id : "" };
      // Site no longer matches the customer — clear the site + its auto-filled
      // address/map (+ contact + assets) so stale wrong-customer data isn't saved.
      return {
        ...f,
        company_id: id,
        site_id: "",
        asset_ids: [],
        contact_id: contactOk ? f.contact_id : "",
        site_address: "",
        site_map_url: "",
      };
    });
  }
  function selectSite(id: string) {
    const s = sites.find((x) => x.id === id);
    setForm((f) => {
      const resolvedCompany = s?.company_id ?? f.company_id;
      const contactOk =
        !f.contact_id ||
        contacts.find((c) => c.id === f.contact_id)?.company_id === resolvedCompany;
      return {
        ...f,
        site_id: id,
        company_id: resolvedCompany,
        // Auto-fill from the site, but keep any typed value if the site has none.
        site_address: s?.address ?? f.site_address,
        site_map_url: s?.map_url ?? f.site_map_url,
        asset_ids: [],
        contact_id: contactOk ? f.contact_id : "",
      };
    });
  }

  const visibleSites = form.company_id
    ? sites.filter((s) => s.company_id === form.company_id || s.id === form.site_id)
    : sites;
  const visibleContacts = form.company_id
    ? contacts.filter((c) => c.company_id === form.company_id || c.id === form.contact_id)
    : contacts;
  const visibleCases = form.company_id
    ? cases.filter((c) => c.company_id === form.company_id || c.id === form.case_id)
    : cases;
  const visibleAssets = assets.filter(
    (a) => (form.site_id && a.site_id === form.site_id) || form.asset_ids.includes(a.id)
  );
  const shownAssets = assetQuery.trim()
    ? visibleAssets.filter((a) =>
        a.name.toLowerCase().includes(assetQuery.trim().toLowerCase())
      )
    : visibleAssets;
  const allShownSelected =
    shownAssets.length > 0 && shownAssets.every((a) => form.asset_ids.includes(a.id));

  function toggleAsset(id: string) {
    setForm((f) => ({
      ...f,
      asset_ids: f.asset_ids.includes(id)
        ? f.asset_ids.filter((x) => x !== id)
        : [...f.asset_ids, id],
    }));
  }
  function toggleAllShown() {
    const ids = shownAssets.map((a) => a.id);
    setForm((f) => ({
      ...f,
      asset_ids: allShownSelected
        ? f.asset_ids.filter((x) => !ids.includes(x))
        : [...new Set([...f.asset_ids, ...ids])],
    }));
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
        job_class: form.job_class || null,
        billing: form.billing || null,
        board_key: form.board_key || null,
        case_id: form.case_id || null,
        asset_ids: form.asset_ids,
        technician_id: form.technician_id || null,
        company_id: form.company_id || null,
        site_id: form.site_id || null,
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

        {/* Cascade: เลือกลูกค้า -> ไซต์ -> (Asset ด้านล่าง) */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="company_id">ลูกค้า (บริษัท)</Label>
            <Select
              id="company_id"
              value={form.company_id}
              onChange={(e) => selectCompany(e.target.value)}
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
              onChange={(e) => selectSite(e.target.value)}
            >
              <option value="">
                {form.company_id ? "— เลือกไซต์ —" : "— เลือกลูกค้าก่อน —"}
              </option>
              {visibleSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
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
              {visibleContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="job_class">ประเภทงาน (CM/PM)</Label>
            <Select id="job_class" value={form.job_class} onChange={(e) => set("job_class", e.target.value)}>
              <option value="">— ไม่ระบุ —</option>
              {WO_JOB_CLASS.map((j) => (
                <option key={j.value} value={j.value}>
                  {j.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="billing">การเรียกเก็บ</Label>
            <Select id="billing" value={form.billing} onChange={(e) => set("billing", e.target.value)}>
              <option value="">— ไม่ระบุ —</option>
              {WO_BILLING.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="board_key">Service Board</Label>
            <Select id="board_key" value={form.board_key} onChange={(e) => set("board_key", e.target.value)}>
              <option value="">— ไม่ระบุ —</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
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
            <Label htmlFor="case_id">เคส / Ticket ที่เกี่ยวข้อง</Label>
            <Select id="case_id" value={form.case_id} onChange={(e) => set("case_id", e.target.value)}>
              <option value="">— ไม่ระบุ —</option>
              {visibleCases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label>
            Asset / ประกัน (เลือกได้หลายรายการ · {form.asset_ids.length} ที่เลือก)
          </Label>
          {!form.site_id ? (
            <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
              เลือกไซต์ก่อน จึงจะเลือก Asset ได้
            </p>
          ) : (
            <div className="rounded-md border border-border">
              <div className="border-b border-border p-2">
                <Input
                  value={assetQuery}
                  onChange={(e) => setAssetQuery(e.target.value)}
                  placeholder="พิมพ์ค้นหา Asset (รหัส / ชื่อ / Serial)…"
                  className="h-8"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[color:var(--primary)]"
                  checked={allShownSelected}
                  onChange={toggleAllShown}
                  disabled={shownAssets.length === 0}
                />
                เลือกทั้งหมด ({shownAssets.length})
              </label>
              <div className="max-h-48 overflow-y-auto">
                {shownAssets.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground">
                    ไม่พบ Asset ในไซต์นี้
                  </p>
                ) : (
                  shownAssets.map((a) => (
                    <label
                      key={a.id}
                      className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/40"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[color:var(--primary)]"
                        checked={form.asset_ids.includes(a.id)}
                        onChange={() => toggleAsset(a.id)}
                      />
                      <span className="truncate">{a.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            งานในประกันให้เลือก Asset ที่อยู่ในประกัน · ที่อยู่หน้างานเติมอัตโนมัติจากไซต์
          </p>
        </div>

        <div>
          <Label>นัดหมาย (ไป–กลับ)</Label>
          <DateRangePicker
            start={form.scheduled_start}
            end={form.scheduled_end}
            onChange={(s, e) =>
              setForm((f) => ({ ...f, scheduled_start: s, scheduled_end: e }))
            }
          />
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
