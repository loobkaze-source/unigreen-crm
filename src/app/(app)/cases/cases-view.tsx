"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Box, FileText, LifeBuoy, Paperclip, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { Case, CaseStatus } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useDataTable,
  DataTableHead,
  DataTableFilterToggle,
  type ColumnDef,
} from "@/components/ui/data-table";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import {
  saveCase,
  deleteCase,
  addCaseAttachment,
  deleteCaseAttachment,
} from "./actions";

type Option = { id: string; name: string };
type SiteOption = { id: string; name: string; company_id: string | null };
type AssetOption = { id: string; name: string; site_id: string | null; status: string };
type AssetCond = "operational" | "degraded" | "down";
type CaseAssetLink = {
  case_id: string;
  equipment_id: string;
  condition: AssetCond | null;
};
/** Affected-asset picker state: asset id -> reported condition ("" = unset). */
type AssetSel = Record<string, "" | AssetCond>;

const CONDITIONS: { value: AssetCond; label: string; cls: string }[] = [
  { value: "operational", label: "ใช้งานได้", cls: "border-green-500 bg-green-50 text-green-700" },
  { value: "degraded", label: "พอใช้งานได้", cls: "border-amber-500 bg-amber-50 text-amber-700" },
  { value: "down", label: "ใช้งานไม่ได้", cls: "border-red-500 bg-red-50 text-red-700" },
];
type Attachment = {
  id: string;
  case_id: string;
  path: string;
  name: string;
  mime: string;
  url: string;
};
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
  sites,
  assets,
  caseAssets,
  supporters,
  attachments,
  canManage,
  orgId,
  initialQuery = "",
  limitHit = false,
}: {
  cases: Case[];
  companies: Option[];
  contacts: Option[];
  sites: SiteOption[];
  assets: AssetOption[];
  caseAssets: CaseAssetLink[];
  supporters: Option[];
  attachments: Attachment[];
  canManage: boolean;
  orgId: string;
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
    site_id: "",
    supporter_id: "",
    case_date: "",
    note: "",
    action: "",
  };
  const [form, setForm] = useState(EMPTY);
  // Affected assets (checkbox picker) + their reported condition.
  const [assetSel, setAssetSel] = useState<AssetSel>({});
  // Files chosen in the form; uploaded after the case is saved (so a brand-new
  // case has an id to attach to).
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

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

  const siteName = useMemo(() => {
    const m = new Map(sites.map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? m.get(id) : undefined);
  }, [sites]);

  const assetName = useMemo(() => {
    const m = new Map(assets.map((a) => [a.id, a.name]));
    return (id: string) => m.get(id) ?? "—";
  }, [assets]);

  // Affected-asset names per case, for the list.
  const assetsByCase = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const link of caseAssets) {
      const arr = m.get(link.case_id) ?? [];
      arr.push(assetName(link.equipment_id));
      m.set(link.case_id, arr);
    }
    return m;
  }, [caseAssets, assetName]);

  // Assets available to tick for the form's currently-selected site.
  const siteAssets = useMemo(
    () => (form.site_id ? assets.filter((a) => a.site_id === form.site_id) : []),
    [assets, form.site_id]
  );

  const columns = useMemo<ColumnDef<Case>[]>(
    () => [
      {
        key: "subject",
        header: "เคส",
        sortAccessor: (c) => c.subject,
        filter: { kind: "text", accessor: (c) => c.subject },
      },
      {
        key: "case_type",
        header: "ประเภท",
        sortAccessor: (c) => c.case_type,
        filter: { kind: "text", accessor: (c) => c.case_type },
      },
      {
        key: "employee",
        header: "ผู้รับผิดชอบ",
        sortAccessor: (c) => c.employee,
        filter: { kind: "text", accessor: (c) => c.employee },
      },
      {
        key: "site",
        header: "ไซต์",
        sortAccessor: (c) => siteName(c.site_id) ?? null,
        filter: { kind: "select", accessor: (c) => siteName(c.site_id) ?? null },
      },
      {
        key: "case_date",
        header: "วันที่",
        sortAccessor: (c) => c.case_date,
      },
      {
        key: "status",
        header: "สถานะ",
        sortAccessor: (c) => c.status,
      }, // filtered via the status chips above
      { key: "_actions", header: "" },
    ],
    [siteName]
  );
  const table = useDataTable(filtered, columns, {
    initialSort: { key: "case_date", dir: "desc" },
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setAssetSel({});
    setNewFiles([]);
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
      site_id: c.site_id || "",
      supporter_id: c.supporter_id || "",
      case_date: c.case_date ? c.case_date.slice(0, 16) : "",
      note: c.note || "",
      action: c.action || "",
    });
    // Pre-tick the assets already on this case, with their saved conditions.
    const sel: AssetSel = {};
    for (const link of caseAssets) {
      if (link.case_id === c.id) sel[link.equipment_id] = link.condition ?? "";
    }
    setAssetSel(sel);
    setNewFiles([]);
    setError(null);
    setOpen(true);
  }

  // Selecting a customer / site narrows what can be ticked — prune stale picks.
  function changeCompany(company_id: string) {
    setForm((f) => ({ ...f, company_id, site_id: "" }));
    setAssetSel({});
  }
  function changeSite(site_id: string) {
    setForm((f) => ({ ...f, site_id }));
    // Keep only ticks that belong to the newly-selected site.
    setAssetSel((sel) => {
      const allowed = new Set(assets.filter((a) => a.site_id === site_id).map((a) => a.id));
      const next: AssetSel = {};
      for (const [id, cond] of Object.entries(sel)) if (allowed.has(id)) next[id] = cond;
      return next;
    });
  }
  function toggleAsset(id: string) {
    setAssetSel((sel) => {
      const next = { ...sel };
      if (id in next) delete next[id];
      else next[id] = "";
      return next;
    });
  }
  function setAssetCond(id: string, cond: AssetCond) {
    setAssetSel((sel) => ({ ...sel, [id]: sel[id] === cond ? "" : cond }));
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
        site_id: form.site_id || null,
        supporter_id: form.supporter_id || null,
        assets: Object.entries(assetSel).map(([equipment_id, condition]) => ({
          equipment_id,
          condition: condition || null,
        })),
        case_date: form.case_date || null,
      });
      if (!res.ok) return setError(res.error);

      // Upload queued attachments now that the case has an id.
      const caseId = res.id ?? editing?.id;
      if (caseId && newFiles.length > 0) {
        setUploading(true);
        const supabase = createClient();
        const errors = (
          await Promise.all(
            newFiles.map(async (file) => {
              const ext = file.name.split(".").pop() || "bin";
              const rand = Math.random().toString(36).slice(2, 8);
              const path = `${orgId}/${caseId}/${Date.now()}-${rand}.${ext}`;
              const { error: upErr } = await supabase.storage
                .from("case-files")
                .upload(path, file, { cacheControl: "3600", upsert: false });
              if (upErr) return `${file.name}: ${upErr.message}`;
              const r = await addCaseAttachment(caseId, path, file.name, file.type);
              return r.ok ? null : `${file.name}: ${r.error}`;
            })
          )
        ).filter(Boolean);
        setUploading(false);
        if (errors.length > 0)
          alert("แนบไฟล์ไม่สำเร็จบางไฟล์:\n" + errors.join("\n"));
      }

      setNewFiles([]);
      setOpen(false);
      router.refresh();
    });
  }

  function removeAttachment(a: Attachment) {
    if (!confirm(`ลบไฟล์แนบ "${a.name}"?`)) return;
    startTransition(async () => {
      const res = await deleteCaseAttachment(a.id, a.path);
      if (!res.ok) alert(res.error);
      else router.refresh();
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
        {canManage ? (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> เพิ่มเคส
          </Button>
        ) : null}
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
        <DataTableFilterToggle table={table} />
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

      {table.rows.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title={cases.length ? "ไม่พบรายการ" : "ยังไม่มีเคส"}
          description={
            cases.length ? "ปรับการค้นหาหรือตัวกรอง" : "บันทึกคำร้อง/ปัญหาจากลูกค้าเพื่อติดตามการแก้ไข"
          }
          action={
            cases.length || !canManage ? null : (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" /> เพิ่มเคส
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <DataTableHead
              table={table}
              sourceRows={cases}
              headClassName="uppercase tracking-wide"
            />
            <tbody>
              {table.rows.map((c) => {
                const meta = statusMeta(c.status);
                return (
                  <tr
                    key={c.id}
                    className="group border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => canManage && openEdit(c)}
                        className="block text-left"
                      >
                        <div className="font-medium hover:text-primary">{c.subject}</div>
                        {c.note ? (
                          <div className="max-w-md truncate text-xs text-muted-foreground">
                            {c.note}
                          </div>
                        ) : null}
                      </button>
                      {(() => {
                        const names = assetsByCase.get(c.id) ?? [];
                        if (names.length === 0) return null;
                        const shown = names.slice(0, 3);
                        return (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {shown.map((n, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground"
                              >
                                <Box className="h-3 w-3" /> {n}
                              </span>
                            ))}
                            {names.length > shown.length ? (
                              <span className="text-xs text-muted-foreground">
                                +{names.length - shown.length}
                              </span>
                            ) : null}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.case_type || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.employee || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {siteName(c.site_id) || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.case_date
                        ? fmtDate(c.case_date)
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {canManage ? (
                        <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => remove(c)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ) : null}
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
              <Label>วันที่</Label>
              <DatePicker
                value={form.case_date}
                onChange={(v) => setForm({ ...form, case_date: v })}
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
              <Label htmlFor="company_id">ลูกค้า</Label>
              <Select
                id="company_id"
                value={form.company_id}
                onChange={(e) => changeCompany(e.target.value)}
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="site_id">ไซต์</Label>
              <Select
                id="site_id"
                value={form.site_id}
                onChange={(e) => changeSite(e.target.value)}
                disabled={!form.company_id}
              >
                <option value="">
                  {form.company_id ? "— เลือกไซต์ —" : "— เลือกลูกค้าก่อน —"}
                </option>
                {sites
                  .filter((s) => s.company_id === form.company_id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="supporter_id">Technical Supporter</Label>
              <Select
                id="supporter_id"
                value={form.supporter_id}
                onChange={(e) => setForm({ ...form, supporter_id: e.target.value })}
              >
                <option value="">— ไม่ระบุ —</option>
                {supporters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              {supporters.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  ยังไม่มีสมาชิก role Technical Supporter — กำหนดได้ที่หน้าผู้ใช้
                </p>
              ) : null}
            </div>
          </div>
          {/* Affected assets — tick the machines with a problem. More can be
              added later after an on-site inspection (just edit the case). */}
          <div>
            <div className="flex items-center justify-between">
              <Label>เครื่องที่มีปัญหา</Label>
              {Object.keys(assetSel).length > 0 ? (
                <span className="text-xs text-muted-foreground">
                  เลือกแล้ว {Object.keys(assetSel).length} เครื่อง
                </span>
              ) : null}
            </div>
            {!form.site_id ? (
              <p className="mt-1 rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                เลือกลูกค้าและไซต์ก่อน จึงจะเลือกเครื่องที่มีปัญหาได้
              </p>
            ) : siteAssets.length === 0 ? (
              <p className="mt-1 rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                ไซต์นี้ยังไม่มี Asset
              </p>
            ) : (
              <div className="mt-1 max-h-64 space-y-1.5 overflow-y-auto rounded-md border border-border bg-muted/20 p-2">
                {siteAssets.map((a) => {
                  const checked = a.id in assetSel;
                  return (
                    <div
                      key={a.id}
                      className={cn(
                        "rounded-md border px-2.5 py-2 transition-colors",
                        checked ? "border-primary/40 bg-card" : "border-transparent"
                      )}
                    >
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAsset(a.id)}
                          className="h-4 w-4 accent-primary"
                        />
                        <span className="text-sm font-medium">{a.name}</span>
                      </label>
                      {checked ? (
                        <div className="mt-2 flex gap-1 pl-6">
                          {CONDITIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setAssetCond(a.id, opt.value)}
                              className={cn(
                                "flex-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                                assetSel[a.id] === opt.value
                                  ? opt.cls
                                  : "border-border bg-card text-muted-foreground hover:bg-muted"
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
            {form.site_id && siteAssets.length > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                ติ๊กเครื่องที่มีปัญหา แล้วระบุสถานะ (อัปเดตให้ Asset ทันทีเมื่อบันทึก) — ตรวจเพิ่มภายหลังค่อยกลับมาติ๊กเพิ่มได้
              </p>
            ) : null}
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
          <div>
            <Label>ไฟล์แนบ (รูป / PDF เช่น จดหมายแจ้งซ่อม)</Label>
            {editing
              ? attachments
                  .filter((a) => a.case_id === editing.id)
                  .map((a) => (
                    <div
                      key={a.id}
                      className="mt-1 flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-sm"
                    >
                      {a.mime.includes("pdf") ? (
                        <FileText className="h-4 w-4 shrink-0 text-red-500" />
                      ) : (
                        <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-primary hover:underline"
                      >
                        {a.name}
                      </a>
                      <button
                        type="button"
                        onClick={() => removeAttachment(a)}
                        className="ml-auto text-muted-foreground hover:text-destructive"
                        title="ลบไฟล์แนบ"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
              : null}
            {newFiles.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="mt-1 flex items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-sm"
              >
                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{f.name}</span>
                <span className="text-xs text-muted-foreground">(รออัปโหลด)</span>
                <button
                  type="button"
                  onClick={() => setNewFiles((fs) => fs.filter((_, j) => j !== i))}
                  className="ml-auto text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
              <Plus className="h-3.5 w-3.5" /> เลือกไฟล์…
              <input
                type="file"
                multiple
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const list = Array.from(e.target.files ?? []);
                  if (list.length) setNewFiles((fs) => [...fs, ...list]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending || uploading}>
              {pending || uploading
                ? "กำลังบันทึก…"
                : editing
                  ? "บันทึกการแก้ไข"
                  : "เพิ่มเคส"}
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
