"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Box,
  Building2,
  FileText,
  Loader2,
  MapPin,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Trash2,
  User,
  Users,
  Wrench,
} from "lucide-react";
import type { Case, CaseStatus, WorkOrderStatus } from "@/lib/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { shrinkImage } from "@/lib/image";
import { CASE_STATUS, caseStatusMeta } from "../constants";
import { statusMeta as woStatusMeta, woCode } from "../../work-orders/constants";
import {
  saveCase,
  updateCaseStatus,
  addCaseAttachment,
  deleteCaseAttachment,
} from "../actions";

type Option = { id: string; name: string };
type CaseAsset = {
  id: string;
  name: string;
  serial: string | null;
  status: string;
  condition: "operational" | "degraded" | "down" | null;
};
type Attachment = { id: string; name: string; mime: string; url: string };
type CaseWorkOrder = {
  id: string;
  number: number | null;
  report_no: string | null;
  title: string;
  status: string;
  job_class: string | null;
  scheduled_start: string | null;
  completed_at: string | null;
  technicianName: string | null;
  crewNames: string[];
};

const CONDITION_LABEL: Record<string, string> = {
  operational: "ใช้งานได้",
  degraded: "พอใช้งานได้",
  down: "ใช้งานไม่ได้",
};
const CONDITION_TONE: Record<string, "success" | "warning" | "danger"> = {
  operational: "success",
  degraded: "warning",
  down: "danger",
};

export function CaseDetail({
  caseRow,
  companyName,
  site,
  contact,
  caseAssets,
  attachments,
  workOrders,
  ownerName,
  supporterName,
  supporters,
  dispatchers,
  canManage,
  orgId,
  status,
}: {
  caseRow: Case;
  companyName: string | null;
  site: { id: string; name: string } | null;
  contact: { name: string; phone: string | null } | null;
  caseAssets: CaseAsset[];
  attachments: Attachment[];
  workOrders: CaseWorkOrder[];
  ownerName: string | null;
  supporterName: string | null;
  /** Members holding Technical Supporter — assignable on the case. */
  supporters: Option[];
  /** Members holding Dispatcher — offered for ผู้รับผิดชอบ. */
  dispatchers: Option[];
  canManage: boolean;
  orgId: string;
  status: CaseStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [statusBusy, setStatusBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildForm = () => ({
    subject: caseRow.subject,
    case_type: caseRow.case_type || "",
    case_from: caseRow.case_from || "",
    customer_wo_ref: caseRow.customer_wo_ref || "",
    employee: caseRow.employee || "",
    team: caseRow.team || "",
    supporter_id: caseRow.supporter_id || "",
    case_date: caseRow.case_date ? caseRow.case_date.slice(0, 16) : "",
    note: caseRow.note || "",
    action: caseRow.action || "",
  });
  const [form, setForm] = useState(buildForm);
  // Resync when the server row actually changes (a save elsewhere) — but a
  // background refresh must not wipe what's being typed.
  const [prevUpdated, setPrevUpdated] = useState(caseRow.updated_at);
  if (prevUpdated !== caseRow.updated_at) {
    setPrevUpdated(caseRow.updated_at);
    setForm(buildForm());
  }

  function set<K extends keyof ReturnType<typeof buildForm>>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    startTransition(async () => {
      // saveCase writes the full record, so the fields this page does not
      // edit (customer, site, machines) ride through unchanged.
      const res = await saveCase({
        id: caseRow.id,
        subject: form.subject,
        status,
        case_type: form.case_type,
        case_from: form.case_from,
        customer_wo_ref: form.customer_wo_ref,
        note: form.note,
        action: form.action,
        employee: form.employee,
        team: form.team,
        company_id: caseRow.company_id,
        contact_id: caseRow.contact_id,
        site_id: caseRow.site_id,
        supporter_id: form.supporter_id || null,
        assets: caseAssets.map((a) => ({ equipment_id: a.id, condition: a.condition })),
        case_date: form.case_date || null,
      });
      setSaving(false);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  function changeStatus(next: CaseStatus) {
    if (next === status || statusBusy) return;
    setStatusBusy(true);
    startTransition(async () => {
      const res = await updateCaseStatus(caseRow.id, next);
      setStatusBusy(false);
      if (!res.ok) alert(res.error);
      router.refresh();
    });
  }

  // ---- Attachments ---------------------------------------------------------
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const chosen = Array.from(files);
    setUploading(true);
    try {
      const supabase = createClient();
      const errors = (
        await Promise.all(
          chosen.map(async (original) => {
            try {
              const file = await shrinkImage(original);
              const ext = file.name.split(".").pop() || "bin";
              const rand = Math.random().toString(36).slice(2, 8);
              const path = `${orgId}/${caseRow.id}/${Date.now()}-${rand}.${ext}`;
              const { error: upErr } = await supabase.storage
                .from("case-files")
                .upload(path, file, { cacheControl: "3600", upsert: false });
              if (upErr) return `${file.name}: ${upErr.message}`;
              const r = await addCaseAttachment(caseRow.id, path, file.name, file.type);
              return r.ok ? null : `${file.name}: ${r.error}`;
            } catch (e) {
              return `${original.name}: ${e instanceof Error ? e.message : "อัปโหลดล้มเหลว"}`;
            }
          })
        )
      ).filter(Boolean);
      if (errors.length > 0) alert("แนบไฟล์ไม่สำเร็จบางไฟล์:\n" + errors.join("\n"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
    router.refresh();
  }
  function removeAttachment(a: Attachment) {
    if (!confirm(`ลบไฟล์แนบ "${a.name}"?`)) return;
    startTransition(async () => {
      const res = await deleteCaseAttachment(a.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  const meta = caseStatusMeta(status);

  // Everyone this case touches, deduplicated, with why they're on it.
  const people: { name: string; role: string; hint?: string | null }[] = [];
  if (ownerName) people.push({ name: ownerName, role: "ผู้เปิดเคส" });
  if (caseRow.employee) people.push({ name: caseRow.employee, role: "ผู้รับผิดชอบ" });
  if (supporterName) people.push({ name: supporterName, role: "Technical Supporter" });
  if (caseRow.team) people.push({ name: caseRow.team, role: "ทีม" });
  const techSeen = new Set<string>();
  for (const w of workOrders) {
    for (const n of [w.technicianName, ...w.crewNames]) {
      if (n && !techSeen.has(n)) {
        techSeen.add(n);
        people.push({ name: n, role: "ช่าง", hint: woCode(w) });
      }
    }
  }
  if (contact) people.push({ name: contact.name, role: "ผู้ติดต่อลูกค้า", hint: contact.phone });

  return (
    <div>
      <Link
        href="/cases"
        className="mb-4 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors hover:border-primary hover:text-primary active:bg-muted"
      >
        <ArrowLeft className="h-4.5 w-4.5" /> กลับไปรายการเคส
      </Link>

      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">
              {caseRow.code ?? "—"}
            </span>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <h1 className="mt-1 text-xl font-bold">{caseRow.subject}</h1>
          {caseRow.customer_wo_ref ? (
            <div className="mt-0.5 font-mono text-xs text-muted-foreground">
              WO ref. {caseRow.customer_wo_ref}
            </div>
          ) : null}
        </div>
        {canManage ? (
          <div className="flex gap-1">
            {CASE_STATUS.map((s) => (
              <button
                key={s.value}
                type="button"
                disabled={statusBusy}
                onClick={() => changeStatus(s.value)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
                  status === s.value
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Customer / place */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" /> ลูกค้าและสถานที่
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">ลูกค้า</div>
                <div>{companyName ?? "—"}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">ไซต์</div>
                {site ? (
                  <Link href={`/sites/${site.id}`} className="text-primary hover:underline">
                    {site.name}
                  </Link>
                ) : (
                  "—"
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">ผู้ติดต่อ</div>
                <div>
                  {contact?.name ?? "—"}
                  {contact?.phone ? (
                    <a
                      href={`tel:${contact.phone}`}
                      className="ml-2 inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Phone className="h-3.5 w-3.5" /> {contact.phone}
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Affected machines */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Box className="h-4 w-4" /> เครื่องที่มีปัญหา ({caseAssets.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {caseAssets.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                ยังไม่ได้ระบุเครื่อง — เพิ่มได้จากปุ่มแก้ไขในหน้ารายการเคส
              </p>
            ) : (
              <div className="space-y-1.5">
                {caseAssets.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-2 rounded-md px-1 py-1.5 hover:bg-muted/40"
                  >
                    <Link
                      href={`/assets/${a.id}`}
                      className="min-w-0 flex-1 truncate text-sm hover:text-primary"
                    >
                      {a.name}
                      {a.serial ? (
                        <span className="ml-1 font-mono text-xs text-muted-foreground">
                          {a.serial}
                        </span>
                      ) : null}
                    </Link>
                    {a.condition ? (
                      <Badge tone={CONDITION_TONE[a.condition]}>
                        {CONDITION_LABEL[a.condition]}
                      </Badge>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Editable details */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" /> รายละเอียดเคส
            </CardTitle>
            {canManage ? (
              <Button onClick={submit} disabled={saving || pending}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? "กำลังบันทึก…" : "บันทึก"}
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              {error ? (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="subject">หัวข้อ *</Label>
                  <Input
                    id="subject"
                    value={form.subject}
                    onChange={(e) => set("subject", e.target.value)}
                    disabled={!canManage}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="customer_wo_ref">WO ref. ของลูกค้า</Label>
                  <Input
                    id="customer_wo_ref"
                    value={form.customer_wo_ref}
                    onChange={(e) => set("customer_wo_ref", e.target.value)}
                    disabled={!canManage}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="case_type">ประเภท</Label>
                  <Input
                    id="case_type"
                    value={form.case_type}
                    onChange={(e) => set("case_type", e.target.value)}
                    disabled={!canManage}
                  />
                </div>
                <div>
                  <Label htmlFor="case_from">แจ้งจาก</Label>
                  <Input
                    id="case_from"
                    value={form.case_from}
                    onChange={(e) => set("case_from", e.target.value)}
                    disabled={!canManage}
                  />
                </div>
                <div>
                  <Label>วันที่</Label>
                  <DatePicker
                    value={form.case_date}
                    onChange={(v) => canManage && set("case_date", v)}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="employee">ผู้รับผิดชอบ</Label>
                  <Combobox
                    id="employee"
                    value={form.employee}
                    onChange={(v) => set("employee", v)}
                    disabled={!canManage}
                    placeholder="— ไม่ระบุ —"
                    options={[
                      ...dispatchers.map((d) => ({ value: d.name, label: d.name })),
                      ...(form.employee &&
                      !dispatchers.some((d) => d.name === form.employee)
                        ? [{ value: form.employee, label: form.employee, hint: "ค่าเดิมในเคสนี้" }]
                        : []),
                    ]}
                  />
                </div>
                <div>
                  <Label htmlFor="team">ทีม</Label>
                  <Input
                    id="team"
                    value={form.team}
                    onChange={(e) => set("team", e.target.value)}
                    disabled={!canManage}
                  />
                </div>
                <div>
                  <Label htmlFor="supporter_id">Technical Supporter</Label>
                  <Select
                    id="supporter_id"
                    value={form.supporter_id}
                    onChange={(e) => set("supporter_id", e.target.value)}
                    disabled={!canManage}
                  >
                    <option value="">— ไม่ระบุ —</option>
                    {supporters.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="note">รายละเอียด / อาการ</Label>
                  <Textarea
                    id="note"
                    rows={4}
                    value={form.note}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      set("note", e.target.value)
                    }
                    disabled={!canManage}
                  />
                </div>
                <div>
                  <Label htmlFor="action">การดำเนินการ</Label>
                  <Textarea
                    id="action"
                    rows={4}
                    value={form.action}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      set("action", e.target.value)
                    }
                    disabled={!canManage}
                  />
                </div>
              </div>
              {/* Customer / site / machines are structural — they cascade into
                  asset states, so they stay behind the edit dialog on /cases. */}
              <p className="text-xs text-muted-foreground">
                เปลี่ยนลูกค้า ไซต์ หรือรายการเครื่อง ได้จากปุ่มดินสอในหน้ารายการเคส
              </p>
            </form>
          </CardContent>
        </Card>

        {/* Work orders raised for this case */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4" /> ใบงานของเคสนี้ ({workOrders.length})
            </CardTitle>
            {canManage ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/work-orders?case=${caseRow.id}`)}
              >
                <Plus className="h-4 w-4" /> สร้างใบงาน
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {workOrders.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                ยังไม่มีใบงานสำหรับเคสนี้
              </p>
            ) : (
              <div className="space-y-1.5">
                {workOrders.map((w) => {
                  const s = woStatusMeta(w.status as WorkOrderStatus);
                  return (
                    <Link
                      key={w.id}
                      href={`/work-orders/${w.id}`}
                      className="block rounded-md border border-border px-3 py-2 transition-colors hover:border-primary/50 hover:bg-muted/30"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {woCode(w)}
                        </span>
                        <Badge tone={s.tone}>{s.label}</Badge>
                      </div>
                      <div className="mt-0.5 truncate text-sm font-medium">{w.title}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        {w.technicianName ? <span>ช่าง {w.technicianName}</span> : null}
                        {w.scheduled_start ? (
                          <span>นัด {fmtDateTime(w.scheduled_start)}</span>
                        ) : null}
                        {w.completed_at ? <span>เสร็จ {fmtDate(w.completed_at)}</span> : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Everyone involved */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" /> ผู้เกี่ยวข้อง ({people.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {people.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                ยังไม่มีผู้เกี่ยวข้องกับเคสนี้
              </p>
            ) : (
              <div className="space-y-1.5">
                {people.map((p, i) => (
                  <div
                    key={`${p.role}-${p.name}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-md px-1 py-1.5 hover:bg-muted/40"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {p.name}
                      {p.hint ? (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {p.hint}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 rounded-full bg-accent px-2.5 py-0.5 text-xs text-accent-foreground">
                      {p.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attachments */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Paperclip className="h-4 w-4" /> ไฟล์แนบ ({attachments.length})
            </CardTitle>
            {canManage ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {uploading ? "กำลังอัปโหลด…" : "แนบไฟล์"}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  hidden
                  onChange={(e) => uploadFiles(e.target.files)}
                />
              </>
            ) : null}
          </CardHeader>
          <CardContent>
            {attachments.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                ยังไม่มีไฟล์แนบ — รูปหน้างานหรือหนังสือแจ้งซ่อมแนบไว้ที่นี่ได้
              </p>
            ) : (
              <div className="space-y-1.5">
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    className="group flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-muted/40"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-sm hover:text-primary"
                    >
                      {a.name}
                    </a>
                    {canManage ? (
                      <button
                        onClick={() => removeAttachment(a)}
                        className="transition-opacity md:opacity-0 md:group-hover:opacity-100"
                        aria-label="ลบไฟล์แนบ"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
