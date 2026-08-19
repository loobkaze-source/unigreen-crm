"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Filter,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";
export type Sort = { key: string; dir: SortDir } | null;

/**
 * A column definition for a data table. `sortAccessor` enables click-to-sort on
 * the header; `filter` enables a per-column filter control in the (toggleable)
 * filter row. A column with neither is shown but not sortable/filterable
 * (e.g. an actions column — give it `header: ""`).
 */
export type ColumnDef<T> = {
  key: string;
  header: string;
  /** Extra classes for this column's header/filter cells (e.g. "text-right"). */
  className?: string;
  /** Value used for sorting. Return a number for numeric/date sort, else string. */
  sortAccessor?: (row: T) => string | number | null | undefined;
  filter?:
    | {
        kind: "text";
        accessor: (row: T) => string | null | undefined;
      }
    | {
        kind: "select";
        /** String value(s) to match against the chosen option. */
        accessor: (row: T) => string | (string | null)[] | null | undefined;
        /** Explicit options; if omitted, distinct values are derived from the data. */
        options?: { value: string; label: string }[];
      };
};

export type DataTable<T> = {
  /** The current page of rows — what the caller renders. */
  rows: T[];
  /** Every row that passed the filters, across all pages. */
  matched: T[];
  columns: ColumnDef<T>[];
  sort: Sort;
  toggleSort: (key: string) => void;
  filters: Record<string, string>;
  setFilter: (key: string, value: string) => void;
  clearFilters: () => void;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  activeFilterCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
  setPage: (p: number) => void;
};

/** Rows put on screen at once. Enough to scroll, far short of what stalls a tab. */
const DEFAULT_PAGE_SIZE = 50;

/**
 * Client-side sort + per-column filter over an in-memory row array. Body
 * rendering stays with the caller; this only processes the rows and drives the
 * shared header/toolbar components below.
 *
 * `rows` is the page to render, not everything that matched — a table asked to
 * lay out several thousand rows at once locks the tab up for seconds. Use
 * `matched` for counts, and render <DataTablePager> to move between pages.
 */
export function useDataTable<T>(
  rows: T[],
  columns: ColumnDef<T>[],
  opts?: { initialSort?: { key: string; dir: SortDir }; pageSize?: number }
): DataTable<T> {
  const [sort, setSort] = useState<Sort>(opts?.initialSort ?? null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;

  const colByKey = useMemo(
    () => new Map(columns.map((c) => [c.key, c])),
    [columns]
  );

  const processed = useMemo(() => {
    let out = rows;

    for (const [key, val] of Object.entries(filters)) {
      if (!val) continue;
      const col = colByKey.get(key);
      if (!col?.filter) continue;
      if (col.filter.kind === "text") {
        const acc = col.filter.accessor;
        const q = val.toLowerCase();
        out = out.filter((r) => (acc(r) ?? "").toString().toLowerCase().includes(q));
      } else {
        const acc = col.filter.accessor;
        out = out.filter((r) => {
          const v = acc(r);
          if (Array.isArray(v)) return v.some((x) => (x ?? "") === val);
          return (v ?? "") === val;
        });
      }
    }

    if (sort) {
      const col = colByKey.get(sort.key);
      if (col?.sortAccessor) {
        const acc = col.sortAccessor;
        out = [...out].sort((a, b) => {
          const av = acc(a);
          const bv = acc(b);
          const aEmpty = av == null || av === "";
          const bEmpty = bv == null || bv === "";
          if (aEmpty && bEmpty) return 0;
          if (aEmpty) return 1; // nulls/blanks always last
          if (bEmpty) return -1;
          let cmp: number;
          if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
          else cmp = av.toString().localeCompare(bv.toString(), "th");
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }

    return out;
  }, [rows, filters, sort, colByKey]);

  const pageCount = Math.max(1, Math.ceil(processed.length / pageSize));
  // Narrowing a filter can strand the reader on a page past the end.
  const current = Math.min(page, pageCount);
  const paged = useMemo(
    () => processed.slice((current - 1) * pageSize, current * pageSize),
    [processed, current, pageSize]
  );

  function toggleSort(key: string) {
    setPage(1);
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null; // third click clears the sort
    });
  }
  function setFilter(key: string, value: string) {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value }));
  }
  function clearFilters() {
    setPage(1);
    setFilters({});
  }
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return {
    rows: paged,
    matched: processed,
    columns,
    sort,
    toggleSort,
    filters,
    setFilter,
    clearFilters,
    showFilters,
    setShowFilters,
    activeFilterCount,
    page: current,
    pageSize,
    pageCount,
    setPage,
  };
}

/**
 * Page controls. Hidden when everything fits on one page, so short tables look
 * exactly as they did before.
 */
export function DataTablePager<T>({ table }: { table: DataTable<T> }) {
  if (table.pageCount <= 1) return null;
  const first = (table.page - 1) * table.pageSize + 1;
  const last = Math.min(table.page * table.pageSize, table.matched.length);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
      <span className="text-muted-foreground">
        {first.toLocaleString("th-TH")}–{last.toLocaleString("th-TH")} จาก{" "}
        {table.matched.length.toLocaleString("th-TH")} รายการ
      </span>
      <div className="flex items-center gap-1">
        <PagerButton onClick={() => table.setPage(1)} disabled={table.page === 1} label="หน้าแรก">
          <ChevronsLeft className="h-4 w-4" />
        </PagerButton>
        <PagerButton onClick={() => table.setPage(table.page - 1)} disabled={table.page === 1} label="ก่อนหน้า">
          <ChevronLeft className="h-4 w-4" />
        </PagerButton>
        <span className="px-2 tabular-nums text-muted-foreground">
          {table.page} / {table.pageCount}
        </span>
        <PagerButton
          onClick={() => table.setPage(table.page + 1)}
          disabled={table.page === table.pageCount}
          label="ถัดไป"
        >
          <ChevronRight className="h-4 w-4" />
        </PagerButton>
        <PagerButton
          onClick={() => table.setPage(table.pageCount)}
          disabled={table.page === table.pageCount}
          label="หน้าสุดท้าย"
        >
          <ChevronsRight className="h-4 w-4" />
        </PagerButton>
      </div>
    </div>
  );
}

function PagerButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-md border border-border p-1.5 text-muted-foreground transition hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * Renders the full <thead>: a sortable header row plus a toggleable filter row.
 * The caller keeps rendering its own bespoke <tbody> over `table.rows`.
 * `sourceRows` is the unfiltered data used to derive select options.
 */
export function DataTableHead<T>({
  table,
  sourceRows,
  headClassName,
  leading,
}: {
  table: DataTable<T>;
  sourceRows: T[];
  headClassName?: string;
  /** An extra leading <th> (e.g. a select-all checkbox column) rendered first. */
  leading?: React.ReactNode;
}) {
  const { columns, sort, toggleSort, filters, setFilter, showFilters } = table;

  return (
    <thead>
      <tr
        className={cn(
          "border-b border-border bg-muted/40 text-left text-xs text-muted-foreground",
          headClassName
        )}
      >
        {leading}
        {columns.map((col) => {
          const sortable = !!col.sortAccessor;
          const active = sort?.key === col.key;
          return (
            <th key={col.key} className={cn("px-4 py-3 font-medium", col.className)}>
              {sortable ? (
                <button
                  type="button"
                  onClick={() => toggleSort(col.key)}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  {col.header}
                  {active ? (
                    sort!.dir === "asc" ? (
                      <ArrowUp className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDown className="h-3.5 w-3.5" />
                    )
                  ) : (
                    <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                  )}
                </button>
              ) : (
                col.header
              )}
            </th>
          );
        })}
      </tr>

      {showFilters ? (
        <tr className="border-b border-border bg-card">
          {leading ? <th aria-hidden /> : null}
          {columns.map((col) => (
            <th key={col.key} className={cn("px-3 py-2", col.className)}>
              {col.filter ? (
                <ColumnFilter
                  col={col}
                  value={filters[col.key] ?? ""}
                  onChange={(v) => setFilter(col.key, v)}
                  sourceRows={sourceRows}
                />
              ) : null}
            </th>
          ))}
        </tr>
      ) : null}
    </thead>
  );
}

function ColumnFilter<T>({
  col,
  value,
  onChange,
  sourceRows,
}: {
  col: ColumnDef<T>;
  value: string;
  onChange: (v: string) => void;
  sourceRows: T[];
}) {
  const base =
    "w-full rounded-md border border-border bg-background px-2 py-1 text-xs font-normal";

  if (!col.filter) return null;

  if (col.filter.kind === "text") {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="กรอง…"
        className={base}
      />
    );
  }

  // select: use explicit options, else derive distinct values from the data
  const acc = col.filter.accessor;
  const options =
    col.filter.options ??
    (() => {
      const set = new Set<string>();
      for (const r of sourceRows) {
        const v = acc(r);
        if (Array.isArray(v)) v.forEach((x) => x && set.add(x));
        else if (v) set.add(v);
      }
      return [...set].sort((a, b) => a.localeCompare(b, "th")).map((v) => ({
        value: v,
        label: v,
      }));
    })();

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={base}
    >
      <option value="">ทั้งหมด</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * A compact toolbar button that toggles the filter row and shows how many
 * column filters are active, with a one-click clear. Place it next to the
 * page's existing search box.
 */
export function DataTableFilterToggle<T>({ table }: { table: DataTable<T> }) {
  const { showFilters, setShowFilters, activeFilterCount, clearFilters } = table;
  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => setShowFilters(!showFilters)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
          showFilters || activeFilterCount
            ? "border-primary bg-accent text-accent-foreground"
            : "border-border bg-card text-muted-foreground hover:bg-muted"
        )}
      >
        <Filter className="h-4 w-4" />
        ตัวกรองคอลัมน์
        {activeFilterCount ? (
          <span className="rounded-full bg-primary px-1.5 text-xs text-white">
            {activeFilterCount}
          </span>
        ) : null}
      </button>
      {activeFilterCount ? (
        <button
          type="button"
          onClick={clearFilters}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          title="ล้างตัวกรองคอลัมน์"
        >
          <X className="h-3.5 w-3.5" /> ล้าง
        </button>
      ) : null}
    </div>
  );
}
