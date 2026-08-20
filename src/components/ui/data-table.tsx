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
import { Combobox } from "@/components/ui/combobox";

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
  /** The sizes this table's pager offers, smallest first. */
  pageSizes: number[];
  pageCount: number;
  setPage: (p: number) => void;
  setPageSize: (n: number) => void;
};

/**
 * Offered in the pager, and the first of them is what the table opens at:
 * enough to scroll, far short of what stalls a tab. 500 is about where laying
 * out the rows starts to drag. A table whose rows are worth reading a few at a
 * time passes its own sizes to useDataTable.
 */
const PAGE_SIZES = [50, 100, 500];
/** Above this many options, a column filter is typed into rather than scrolled. */
const SEARCHABLE_FROM = 12;

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
  opts?: { initialSort?: { key: string; dir: SortDir }; pageSizes?: number[] }
): DataTable<T> {
  const pageSizes = opts?.pageSizes?.length ? opts.pageSizes : PAGE_SIZES;
  const [sort, setSort] = useState<Sort>(opts?.initialSort ?? null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setSize] = useState(pageSizes[0]);

  // When the incoming row set itself changes size (a search narrowed it, the
  // search was cleared), start from page 1 — otherwise clearing a query would
  // silently drop the reader back on page 7 of the unfiltered list.
  const [prevRowCount, setPrevRowCount] = useState(rows.length);
  if (prevRowCount !== rows.length) {
    setPrevRowCount(rows.length);
    setPage(1);
  }

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
    pageSizes,
    pageCount,
    setPage,
    setPageSize: (n: number) => {
      setSize(n);
      setPage(1);
    },
  };
}

/**
 * Page controls. Hidden only while the table is shorter than the smallest page
 * size, so short tables look exactly as they did before — but once shown it
 * stays shown, because choosing 500 rows on a 300-row table would otherwise
 * take the control that did it off the screen.
 */
export function DataTablePager<T>({ table }: { table: DataTable<T> }) {
  if (table.matched.length <= table.pageSizes[0]) return null;
  const onlyPage = table.pageCount <= 1;
  const first = (table.page - 1) * table.pageSize + 1;
  const last = Math.min(table.page * table.pageSize, table.matched.length);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>
          {first.toLocaleString("th-TH")}–{last.toLocaleString("th-TH")} จาก{" "}
          {table.matched.length.toLocaleString("th-TH")} รายการ
        </span>
        <label className="flex items-center gap-1.5">
          <span className="sr-only">จำนวนแถวต่อหน้า</span>
          <select
            value={table.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="h-7 rounded-md border border-input bg-card px-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {table.pageSizes.map((n) => (
              <option key={n} value={n}>
                {n} แถว/หน้า
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={cn("flex items-center gap-1", onlyPage && "hidden")}>
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

/**
 * The "nothing matched" line, rendered as a row inside the table rather than in
 * place of it.
 *
 * A filter that empties the list used to take the whole table with it, and the
 * filter row lives in that table's header — so the box holding the word that
 * matched nothing disappeared along with the rows, and the way back was the
 * toolbar's clear button rather than the backspace the reader's finger was
 * already on. The table stays; only the rows are missing.
 */
export function DataTableNoMatch<T>({
  table,
  children,
}: {
  table: DataTable<T>;
  children?: React.ReactNode;
}) {
  if (table.rows.length > 0) return null;
  return (
    <tr>
      <td
        colSpan={table.columns.length}
        className="px-4 py-12 text-center text-sm text-muted-foreground"
      >
        {children ?? "ไม่พบรายการที่ตรงกับตัวกรอง — แก้คำค้นหรือตัวกรองด้านบนได้เลย"}
      </td>
    </tr>
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

  // Memoized: deriving distinct values walks every source row (with Thai
  // collation on the sort), and this used to re-run for every select column
  // on every keystroke in a neighbouring text filter.
  const filter = col.filter;
  const options = useMemo(() => {
    if (!filter || filter.kind !== "select") return [];
    if (filter.options) return filter.options;
    const acc = filter.accessor;
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
  }, [filter, sourceRows]);

  if (!filter) return null;

  if (filter.kind === "text") {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="กรอง…"
        className={base}
      />
    );
  }

  // A column like "นิติบุคคล" derives one option per distinct value, which on
  // this data is hundreds — scrolling a native dropdown to find one is the same
  // problem the form pickers had. Short lists stay native, where a search box
  // over four statuses would only be in the way.
  if (options.length > SEARCHABLE_FROM) {
    return (
      <Combobox
        compact
        value={value}
        onChange={onChange}
        placeholder="ทั้งหมด"
        options={options}
      />
    );
  }

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
