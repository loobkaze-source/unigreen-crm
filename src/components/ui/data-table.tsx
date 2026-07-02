"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Filter, X } from "lucide-react";
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
  rows: T[];
  columns: ColumnDef<T>[];
  sort: Sort;
  toggleSort: (key: string) => void;
  filters: Record<string, string>;
  setFilter: (key: string, value: string) => void;
  clearFilters: () => void;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  activeFilterCount: number;
};

/**
 * Client-side sort + per-column filter over an in-memory row array. Body
 * rendering stays with the caller; this only processes the rows and drives the
 * shared header/toolbar components below.
 */
export function useDataTable<T>(
  rows: T[],
  columns: ColumnDef<T>[],
  opts?: { initialSort?: { key: string; dir: SortDir } }
): DataTable<T> {
  const [sort, setSort] = useState<Sort>(opts?.initialSort ?? null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);

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

  function toggleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null; // third click clears the sort
    });
  }
  function setFilter(key: string, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
  }
  function clearFilters() {
    setFilters({});
  }
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return {
    rows: processed,
    columns,
    sort,
    toggleSort,
    filters,
    setFilter,
    clearFilters,
    showFilters,
    setShowFilters,
    activeFilterCount,
  };
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
