"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Repeat, Search, Trash2 } from "lucide-react";
import type { ServiceContract } from "@/lib/database.types";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useDataTable,
  DataTablePager,
  DataTableHead,
  DataTableNoMatch,
  DataTableFilterToggle,
  type ColumnDef,
} from "@/components/ui/data-table";
import { fmtDate } from "@/lib/format";
import { serviceTypeLabel } from "./constants";
import { ContractFormModal, type Option, type SiteOption } from "./contract-form-modal";
import { deleteContract } from "./actions";
import { ScopeBanner } from "@/components/app/scope-banner";

type ContractRow = ServiceContract & {
  total: number;
  done: number;
  nextDue: string | null;
};

// What the cells read, kept in one place so each column filters on the text
// the reader is looking at — typing "5 ปี" or "12-2022" narrows the column it
// was typed into, rather than matching a value only the database can see.
const cycleText = (c: ContractRow) =>
  `ปีละ ${c.frequency_per_year} ครั้ง · ${c.duration_years} ปี`;
const progressText = (c: ContractRow) => `${c.done}/${c.total}`;

/**
 * The one thing a contract is, right now.
 *
 *   complete  every round has a finished job — the contract has been honoured,
 *             whatever its dates say
 *   expired   its term has run out (or it was closed) with rounds still owed
 *   active    live, with rounds still to come
 *
 * Complete is tested first: a five-year contract that was served in full is
 * done, not expired, even once its end date has passed.
 */
type Quick = "all" | "active" | "expired" | "complete";
const QUICK: { value: Quick; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "active", label: "ยังมีผล" },
  { value: "expired", label: "หมดอายุ" },
  { value: "complete", label: "เข้าบริการครบแล้ว" },
];
function quickOf(c: ContractRow, today: string): Exclude<Quick, "all"> {
  if (c.total > 0 && c.done >= c.total) return "complete";
  if (c.status !== "active" || (c.end_date && c.end_date < today)) return "expired";
  return "active";
}
const dueText = (c: ContractRow) => (c.nextDue ? fmtDate(c.nextDue) : "ครบแล้ว");

export function ContractsView({
  contracts,
  companies,
  sites,
  technicians,
  scopeSite = null,
}: {
  contracts: ContractRow[];
  companies: Option[];
  sites: SiteOption[];
  technicians: Option[];
  /** Set when opened from a site's page: show only that site's contracts. */
  scopeSite?: SiteOption | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [quick, setQuick] = useState<Quick>("all");
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceContract | null>(null);
  const [, startTransition] = useTransition();

  const companyName = useMemo(() => {
    const m = new Map(companies.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? m.get(id) : undefined);
  }, [companies]);
  const siteName = useMemo(() => {
    const m = new Map(sites.map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? m.get(id) : undefined);
  }, [sites]);
  /** The line under the title: what kind of work, for whom, where. */
  const subtitle = useCallback(
    (c: ContractRow) =>
      [serviceTypeLabel(c.service_type), companyName(c.company_id), siteName(c.site_id)]
        .filter(Boolean)
        .join(" · "),
    [companyName, siteName]
  );


  // Opened from a site's page, the list is that site's — before anything else.
  const pool = useMemo(
    () => (scopeSite ? contracts.filter((c) => c.site_id === scopeSite.id) : contracts),
    [contracts, scopeSite]
  );
  const counts = useMemo(
    () => ({
      all: pool.length,
      active: pool.filter((c) => quickOf(c, today) === "active").length,
      expired: pool.filter((c) => quickOf(c, today) === "expired").length,
      complete: pool.filter((c) => quickOf(c, today) === "complete").length,
    }),
    [pool, today]
  );
  const filtered = useMemo(() => {
    const quicked = quick === "all" ? pool : pool.filter((c) => quickOf(c, today) === quick);
    const q = query.trim().toLowerCase();
    if (!q) return quicked;
    return quicked.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.contract_no || "").toLowerCase().includes(q)
    );
  }, [pool, query, quick, today]);

  const columns = useMemo<ColumnDef<ContractRow>[]>(
    () => [
      {
        key: "contract_no",
        header: "เลขที่",
        sortAccessor: (c) => c.contract_no,
        // Typed into: "UNG" narrows to one department, "2026" to one year.
        filter: { kind: "text", accessor: (c) => c.contract_no },
      },
      {
        key: "title",
        header: "สัญญา",
        sortAccessor: (c) => c.title,
        // Both lines of the cell, so the customer, the site and the kind of
        // work are all reachable from the column they are printed in.
        filter: { kind: "text", accessor: (c) => `${c.title} · ${subtitle(c)}` },
      },
      {
        key: "frequency",
        header: "รอบ",
        sortAccessor: (c) => c.frequency_per_year,
        filter: { kind: "text", accessor: cycleText },
      },
      {
        key: "progress",
        header: "ความคืบหน้า",
        sortAccessor: (c) => (c.total ? c.done / c.total : 0),
        filter: { kind: "text", accessor: progressText },
      },
      {
        key: "nextDue",
        header: "รอบถัดไป",
        sortAccessor: (c) => c.nextDue,
        filter: { kind: "text", accessor: dueText },
      },
      { key: "_actions", header: "" },
    ],
    [subtitle]
  );
  const table = useDataTable(filtered, columns, {
    initialSort: { key: "nextDue", dir: "asc" },
    // A contract is read one at a time — ten on screen is a working list, and
    // the pager is there from the eleventh rather than only past fifty.
    pageSizes: [10, 25, 50, 100, 250, 500],
  });

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(c: ServiceContract, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setEditing(c);
    setOpen(true);
  }
  function remove(c: ServiceContract, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`ลบสัญญา "${c.title}"? รอบเข้าบริการทั้งหมดจะถูกลบด้วย`)) return;
    startTransition(async () => {
      const res = await deleteContract(c.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <PageHeader
        title="สัญญาบริการ"
        subtitle="สัญญาดูแลรายปี เช่น สัญญาบำรุงรักษาโซลาร์ / ล้างฟิลเตอร์ EV — กำหนดรอบและติดตามจำนวนครั้งที่เข้าบริการ"
      >
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> สร้างสัญญา
        </Button>
      </PageHeader>
      {scopeSite ? <ScopeBanner siteName={scopeSite.name} allHref="/service-contracts" /> : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาสัญญา…"
            className="pl-9"
          />
        </div>
        {/* The three states a contract can be in, one tap each. Counted, so
            the chip says what it hides before it is pressed. */}
        <div className="flex flex-wrap gap-1">
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

      {contracts.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="ยังไม่มีสัญญาบริการ"
          description="สร้างสัญญาบริการรายปี ระบบจะสร้างรอบเข้าบริการตามความถี่ให้อัตโนมัติ"
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> สร้างสัญญา
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <DataTableHead
              table={table}
              sourceRows={contracts}
              headClassName="uppercase tracking-wide"
            />
            <tbody>
              {table.rows.map((c) => {
                const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
                const overdue = c.nextDue && c.nextDue < today;
                return (
                  <tr
                    key={c.id}
                    className="group border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="whitespace-nowrap px-4 py-3 align-top font-mono text-xs text-muted-foreground">
                      {c.contract_no ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/service-contracts/${c.id}`} className="block">
                        <div className="font-medium hover:text-primary">{c.title}</div>
                        <div className="text-xs text-muted-foreground">{subtitle(c)}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{cycleText(c)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{progressText(c)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.nextDue ? (
                        <span
                          className={
                            overdue ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"
                          }
                        >
                          {dueText(c)}
                        </span>
                      ) : (
                        <Badge tone="success">{dueText(c)}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                        <Button variant="ghost" size="icon" onClick={(e) => openEdit(c, e)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={(e) => remove(c, e)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              <DataTableNoMatch table={table} />
            </tbody>
          </table>
          <DataTablePager table={table} />
        </div>
      )}

      <ContractFormModal
        open={open}
        onClose={() => setOpen(false)}
        editing={editing}
        initial={scopeSite ? { site_id: scopeSite.id, company_id: scopeSite.company_id ?? "" } : undefined}
        companies={companies}
        sites={sites}
        technicians={technicians}
      />
    </div>
  );
}
