"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import type { Warranty, WarrantyKind } from "@/lib/database.types";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useDataTable,
  DataTablePager,
  DataTableHead,
  DataTableNoMatch,
  DataTableFilterToggle,
  type ColumnDef,
} from "@/components/ui/data-table";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { saveWarranty, deleteWarranty } from "./actions";
import { sitesOf, withCompany, withSite } from "@/lib/linked-pickers";
import { ScopeBanner } from "@/components/app/scope-banner";

type Option = { id: string; name: string };
type SiteOption = Option & { company_id: string | null };

const KINDS: { value: WarrantyKind; label: string }[] = [
  { value: "project", label: "ประกันโครงการ (งานติดตั้ง)" },
  { value: "equipment", label: "ประกันอุปกรณ์ (ตาม Serial)" },
];

/**
 * In force, or not. Void counts as not; so does a term that has run out even
 * if nobody flipped the status.
 */
type Quick = "all" | "active" | "expired";
const QUICK: { value: Quick; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "active", label: "ยังมีผล" },
  { value: "expired", label: "หมดอายุ" },
];
function quickOf(w: Warranty, today: string): Exclude<Quick, "all"> {
  if (w.status !== "active") return "expired";
  if (w.end_date && w.end_date < today) return "expired";
  return "active";
}
const kindLabel = (v: WarrantyKind) => KINDS.find((k) => k.value === v)?.label ?? v;

export function WarrantiesView({
  warranties,
  companies,
  sites,
  scopeSite = null,
}: {
  warranties: Warranty[];
  companies: Option[];
  sites: SiteOption[];
  /** Set when opened from a site's page: show only that site's warranties. */
  scopeSite?: SiteOption | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<WarrantyKind | "all">("all");
  const [quick, setQuick] = useState<Quick>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Warranty | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const companyName = useMemo(() => {
    const m = new Map(companies.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? m.get(id) : undefined);
  }, [companies]);

  const today = new Date().toISOString().slice(0, 10);
  const EMPTY = {
    kind: "project" as WarrantyKind,
    title: "",
    company_id: "",
    site_id: "",
    serial_number: "",
    provider: "",
    start_date: "",
    end_date: "",
    terms: "",
  };
  const [form, setForm] = useState(EMPTY);

  // Counted over what the other filters leave, so the numbers are the ones
  // pressing the chip would actually show.
  const counts = useMemo(() => {
    const base = warranties.filter(
      (w) => (!scopeSite || w.site_id === scopeSite.id) && (kindFilter === "all" || w.kind === kindFilter)
    );
    return {
      all: base.length,
      active: base.filter((w) => quickOf(w, today) === "active").length,
      expired: base.filter((w) => quickOf(w, today) === "expired").length,
    };
  }, [warranties, scopeSite, kindFilter, today]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return warranties.filter((w) => {
      // Opened from a site's page, the list is that site's — before anything.
      if (scopeSite && w.site_id !== scopeSite.id) return false;
      if (kindFilter !== "all" && w.kind !== kindFilter) return false;
      if (quick !== "all" && quickOf(w, today) !== quick) return false;
      if (!q) return true;
      return (
        w.title.toLowerCase().includes(q) ||
        (w.serial_number || "").toLowerCase().includes(q) ||
        (w.provider || "").toLowerCase().includes(q)
      );
    });
  }, [warranties, query, kindFilter, scopeSite, quick, today]);

  const columns = useMemo<ColumnDef<Warranty>[]>(
    () => [
      {
        key: "title",
        header: "รายการ",
        sortAccessor: (w) => w.title,
        filter: { kind: "text", accessor: (w) => w.title },
      },
      {
        key: "kind",
        header: "ประเภท",
        sortAccessor: (w) => kindLabel(w.kind),
      }, // filtered via the kind chips above
      {
        key: "serial_number",
        header: "Serial",
        sortAccessor: (w) => w.serial_number,
        filter: { kind: "text", accessor: (w) => w.serial_number },
      },
      {
        key: "end_date",
        header: "หมดอายุ",
        sortAccessor: (w) => w.end_date,
      },
      { key: "_actions", header: "" },
    ],
    []
  );
  const table = useDataTable(filtered, columns, {
    initialSort: { key: "end_date", dir: "asc" },
  });

  function openCreate() {
    setEditing(null);
    // Opened from a site's page, the new warranty is for that site.
    setForm(
      scopeSite
        ? { ...EMPTY, site_id: scopeSite.id, company_id: scopeSite.company_id ?? "" }
        : EMPTY
    );
    setError(null);
    setOpen(true);
  }
  function openEdit(w: Warranty) {
    setEditing(w);
    setForm({
      kind: w.kind,
      title: w.title,
      company_id: w.company_id || "",
      site_id: w.site_id || "",
      serial_number: w.serial_number || "",
      provider: w.provider || "",
      start_date: w.start_date || "",
      end_date: w.end_date || "",
      terms: w.terms || "",
    });
    setError(null);
    setOpen(true);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveWarranty({
        id: editing?.id,
        kind: form.kind,
        title: form.title,
        company_id: form.company_id || null,
        site_id: form.site_id || null,
        serial_number: form.serial_number,
        provider: form.provider,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        terms: form.terms,
      });
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  }
  function remove(w: Warranty) {
    if (!confirm(`ลบการรับประกัน "${w.title}"?`)) return;
    startTransition(async () => {
      const res = await deleteWarranty(w.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  function expiryBadge(w: Warranty) {
    if (!w.end_date) return <span className="text-muted-foreground">—</span>;
    const expired = w.end_date < today;
    return (
      <span className={cn("text-sm", expired ? "font-medium text-destructive" : "")}>
        {fmtDate(w.end_date)}
        {expired ? (
          <Badge tone="danger" className="ml-2">
            หมดอายุ
          </Badge>
        ) : null}
      </span>
    );
  }

  return (
    <div>
      <PageHeader
        title="การรับประกัน"
        subtitle="ประกันงานติดตั้งทั้งโครงการ และประกันอุปกรณ์รายชิ้นตาม Serial number"
      >
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> เพิ่มการรับประกัน
        </Button>
      </PageHeader>
      {scopeSite ? <ScopeBanner siteName={scopeSite.name} allHref="/warranties" /> : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหา / Serial / ผู้รับประกัน…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <Chip active={kindFilter === "all"} onClick={() => setKindFilter("all")}>
            ทั้งหมด
          </Chip>
          {KINDS.map((k) => (
            <Chip
              key={k.value}
              active={kindFilter === k.value}
              onClick={() => setKindFilter(k.value)}
            >
              {k.value === "project" ? "โครงการ" : "อุปกรณ์"}
            </Chip>
          ))}
        </div>
        {/* In force or not — the question a warranty exists to answer. */}
        <div className="flex flex-wrap gap-1 border-l border-border pl-2">
          {QUICK.map((f) => (
            <Chip
              key={f.value}
              active={quick === f.value}
              onClick={() => setQuick(f.value)}
              count={counts[f.value]}
            >
              {f.label}
            </Chip>
          ))}
        </div>
        <DataTableFilterToggle table={table} />
      </div>

      {warranties.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="ยังไม่มีการรับประกัน"
          description="บันทึกการรับประกันโครงการหรืออุปกรณ์ เพื่อติดตามวันหมดอายุ"
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> เพิ่มการรับประกัน
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <DataTableHead
              table={table}
              sourceRows={warranties}
              headClassName="uppercase tracking-wide"
            />
            <tbody>
              {table.rows.map((w) => (
                <tr
                  key={w.id}
                  className="group border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{w.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {[companyName(w.company_id), w.provider].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={w.kind === "project" ? "info" : "primary"}>
                        {w.kind === "project" ? "โครงการ" : "อุปกรณ์"}
                      </Badge>
                      {/* A copy of the asset's own warranty fields. It says so,
                          because editing it here would be undone the next time
                          the asset is saved. */}
                      {w.mirrored ? <Badge tone="muted">จาก Asset</Badge> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {w.serial_number || "—"}
                  </td>
                  <td className="px-4 py-3">{expiryBadge(w)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                      {w.mirrored && w.equipment_id ? (
                        // The asset is where this is written; the pencil goes there.
                        <Link
                          href={`/assets/${w.equipment_id}`}
                          aria-label="แก้ที่ Asset"
                          title="แก้ไขได้ที่หน้า Asset"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(w)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => remove(w)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              <DataTableNoMatch table={table} />
            </tbody>
          </table>
          <DataTablePager table={table} />
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "แก้ไขการรับประกัน" : "เพิ่มการรับประกัน"}
        size="lg"
      >
        <form onSubmit={submit} className="space-y-4">
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="kind">ประเภทการรับประกัน</Label>
              <Select
                id="kind"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as WarrantyKind })}
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="provider">ผู้รับประกัน</Label>
              <Input
                id="provider"
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                placeholder="ผู้ผลิต / ผู้ติดตั้ง"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="title">ชื่อ/รายละเอียด *</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={
                form.kind === "project"
                  ? "เช่น ประกันงานติดตั้งโซลาร์ 1 ปี"
                  : "เช่น ประกันอินเวอร์เตอร์ 5 ปี"
              }
              required
              autoFocus
            />
          </div>
          {form.kind === "equipment" ? (
            <div>
              <Label htmlFor="serial_number">Serial number</Label>
              <Input
                id="serial_number"
                value={form.serial_number}
                onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
              />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="company_id">นิติบุคคล (ลูกค้า)</Label>
              <Combobox
                id="company_id"
                value={form.company_id}
                onChange={(company_id) => setForm(withCompany(form, company_id, sites))}
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
                placeholder={form.company_id ? "— เลือกไซต์ของลูกค้านี้ —" : "— ไม่ระบุ —"}
                options={sitesOf(sites, form.company_id, form.site_id).map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="start_date">เริ่มคุ้มครอง</Label>
              <Input
                id="start_date"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="end_date">หมดอายุ</Label>
              <Input
                id="end_date"
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="terms">เงื่อนไข/รายละเอียด</Label>
            <Textarea
              id="terms"
              value={form.terms}
              onChange={(e) => setForm({ ...form, terms: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มการรับประกัน"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

