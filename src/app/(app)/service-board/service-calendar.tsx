"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { th } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";

/** One thing that happens on one day, whatever kind of thing it is. */
export type CalendarItem = {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  href: string;
  label: string;
  sub?: string;
  tone: "danger" | "info" | "warning" | "success" | "primary" | "muted" | "default";
};

/** How many fit in a cell before it stops listing and starts counting. */
const PER_CELL = 3;
const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const ymd = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * The service board as a month.
 *
 * The list answers "what is next"; this answers "what does the week of the
 * 14th look like", which is the question a dispatcher is actually holding a
 * pen over. Same rounds, same jobs, arranged by the thing they have in common
 * — a date.
 *
 * A cell shows three and counts the rest, because a day with eleven cleanings
 * on it should not be eleven rows tall and neither should the other thirty
 * days. Tapping a day opens the whole of it underneath.
 */
export function ServiceCalendar({ items }: { items: CalendarItem[] }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [picked, setPicked] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const it of items) {
      if (!m.has(it.date)) m.set(it.date, []);
      m.get(it.date)!.push(it);
    }
    return m;
  }, [items]);

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month)),
        end: endOfWeek(endOfMonth(month)),
      }),
    [month]
  );

  const today = new Date();
  const inMonth = items.filter((i) => i.date.startsWith(format(month, "yyyy-MM"))).length;
  const pickedItems = picked ? byDay.get(picked) ?? [] : [];

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            aria-label="เดือนก่อนหน้า"
            className="rounded-md p-1.5 hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-36 text-center text-sm font-medium">
            {format(month, "MMMM yyyy", { locale: th })}
          </div>
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            aria-label="เดือนถัดไป"
            className="rounded-md p-1.5 hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{inMonth} รายการในเดือนนี้</span>
          <button
            type="button"
            onClick={() => {
              setMonth(startOfMonth(new Date()));
              setPicked(null);
            }}
            className="rounded-md border border-border px-2.5 py-1 font-medium text-foreground hover:bg-muted"
          >
            วันนี้
          </button>
        </div>
      </div>

      {/* A month needs its width; on a phone it scrolls rather than squeezing
          seven columns into a screen that cannot hold them. */}
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-7 border-b border-border text-center text-[11px] text-muted-foreground">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1.5">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = ymd(day);
              const list = byDay.get(key) ?? [];
              const other = !isSameMonth(day, month);
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => setPicked((p) => (p === key ? null : key))}
                  className={cn(
                    // The seventh of every row closes on the card's own border, not
                    // its own — otherwise the right edge is drawn twice and the
                    // left edge not at all.
                    "min-h-24 border-b border-r border-border p-1 text-left align-top [&:nth-child(7n)]:border-r-0",
                    other && "bg-muted/30",
                    picked === key && "bg-accent/60"
                  )}
                >
                  <div
                    className={cn(
                      "mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs",
                      isSameDay(day, today) && "bg-primary font-semibold text-white",
                      other && "text-muted-foreground/50"
                    )}
                  >
                    {day.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {list.slice(0, PER_CELL).map((it) => (
                      <div
                        key={it.id}
                        title={it.label}
                        className={cn(
                          "truncate rounded px-1 py-0.5 text-[11px] leading-tight",
                          it.tone === "danger"
                            ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400"
                            : it.tone === "warning"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400"
                              : it.tone === "success"
                                ? "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400"
                                : "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400"
                        )}
                      >
                        {it.label}
                      </div>
                    ))}
                    {list.length > PER_CELL ? (
                      <div className="px-1 text-[11px] text-muted-foreground">
                        +{list.length - PER_CELL} รายการ
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {picked ? (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 text-sm font-medium">
            {fmtDate(picked)}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {pickedItems.length} รายการ
            </span>
          </div>
          {pickedItems.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">ไม่มีรายการในวันนี้</p>
          ) : (
            <ul className="space-y-1.5">
              {pickedItems.map((it) => (
                <li key={it.id}>
                  <Link
                    href={it.href}
                    className="flex items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{it.label}</div>
                      {it.sub ? (
                        <div className="truncate text-xs text-muted-foreground">{it.sub}</div>
                      ) : null}
                    </div>
                    <Badge className="shrink-0" tone={it.tone}>
                      {fmtDate(it.date)}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
