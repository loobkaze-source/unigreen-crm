"use client";

import * as React from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboboxOption = { value: string; label: string; hint?: string };

/**
 * A single-select that is typed into rather than scrolled through, for the
 * places a plain <Select> stopped working: there are 2,488 sites, and a native
 * dropdown of that many options is unusable even when every one is present.
 *
 * Matching is on the label and hint together, so a site can be found by its
 * customer as readily as by its own name. Only a slice of the matches is put in
 * the DOM — a thousand <li> elements per keystroke is its own kind of unusable —
 * and the count of what is left over is shown so nobody assumes the list ended.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "เลือก…",
  emptyText = "ไม่พบรายการที่ค้นหา",
  allowClear = true,
  disabled,
  id,
  className,
  compact = false,
  allowCustom = false,
}: {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  allowClear?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Sized to sit in a table's filter row rather than a form. */
  compact?: boolean;
  /**
   * Offer what was typed as a value of its own. For a field whose vocabulary
   * lives in the data — a machine kind, say — the next new one has to be
   * enterable without a code change.
   */
  allowCustom?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const selected = React.useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value]
  );

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q)
    );
  }, [options, query]);

  /** How many matches get rendered; the rest are reachable by typing more. */
  const VISIBLE = 100;
  const typed = query.trim();
  const isNew =
    allowCustom && typed !== "" && !options.some((o) => o.label.toLowerCase() === typed.toLowerCase());
  const shown = [
    ...(isNew ? [{ value: typed, label: typed, hint: "ใช้ค่าที่พิมพ์" }] : []),
    ...matches.slice(0, VISIBLE),
  ];
  const hidden = matches.length - Math.min(matches.length, VISIBLE);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Keep the highlighted row in view while arrowing through a long list.
  React.useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function openList() {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  /**
   * Hands the value up, and tells the DOM around it that something changed.
   * This control is a button, so picking in it fires none of the events an
   * <input> would — a form watching for edits would never hear about it.
   */
  /**
   * Hands the value up, and tells the DOM around it that something changed.
   * This control is a button, so picking in it fires none of the events an
   * <input> would, and a form watching for edits would never hear about it.
   * The event goes out from the root — `from` is whatever the reader clicked
   * or typed into — so a listener can tell a pick from a search keystroke.
   */
  function commit(next: string, from: Element) {
    onChange(next);
    from.closest("[data-combobox]")?.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function choose(option: ComboboxOption, from: Element) {
    commit(option.value, from);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[active]) choose(shown[active], e.currentTarget);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} data-combobox className={cn("relative", className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border text-left transition-colors",
          compact
            ? "h-[26px] border-border bg-background pl-2 pr-7 text-xs font-normal"
            : "h-9 border-input bg-card pl-3 pr-9 text-sm shadow-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.label : placeholder}
        </span>
      </button>

      {allowClear && selected && !disabled ? (
        <button
          type="button"
          aria-label="ล้างค่า"
          onClick={(e) => commit("", e.currentTarget)}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground",
            compact ? "right-5" : "right-7"
          )}
        >
          <X className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        </button>
      ) : null}
      <ChevronDown
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
          compact ? "right-1.5 h-3.5 w-3.5" : "right-2.5 h-4 w-4"
        )}
      />

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-2.5">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              data-combobox-search
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="พิมพ์เพื่อค้นหา…"
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <ul ref={listRef} className="max-h-64 overflow-y-auto py-1">
            {shown.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</li>
            ) : (
              shown.map((o, i) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={(e) => choose(o, e.currentTarget)}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm",
                      i === active && "bg-muted"
                    )}
                  >
                    <Check
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0",
                        o.value === value ? "text-primary" : "invisible"
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block truncate">{o.label}</span>
                      {o.hint ? (
                        <span className="block truncate text-xs text-muted-foreground">{o.hint}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>

          {hidden > 0 ? (
            <div className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
              แสดง {shown.length} จาก {matches.length.toLocaleString("th-TH")} รายการ — พิมพ์เพิ่มเพื่อค้นหาให้แคบลง
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
