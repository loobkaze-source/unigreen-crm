"use client";

import { useEffect, useRef, useState } from "react";
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
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");
const parse = (s: string): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};
/** Date -> datetime-local string "YYYY-MM-DDTHH:mm". */
const toStr = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dmy = (d: Date) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;

/**
 * Single date(+time) picker with a Thai calendar and DD-MM-YYYY display —
 * replaces native datetime-local inputs whose format follows the browser
 * locale (mm/dd/yyyy). `value` is a datetime-local string; onChange emits
 * the same (or "" when cleared).
 */
export function DatePicker({
  value,
  onChange,
  withTime = true,
  placeholder = "เลือกวันที่",
}: {
  value: string;
  onChange: (value: string) => void;
  withTime?: boolean;
  placeholder?: string;
}) {
  const d = parse(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(d ?? new Date());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (d) setView(startOfMonth(d));
    function onDoc(ev: MouseEvent) {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const time = d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "09:00";

  function clickDay(day: Date) {
    const [h, m] = time.split(":").map(Number);
    const nd = new Date(day);
    nd.setHours(h || 0, m || 0, 0, 0);
    onChange(toStr(nd));
    if (!withTime) setOpen(false);
  }

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(view), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(view), { weekStartsOn: 0 }),
  });

  const summary = d ? dmy(d) + (withTime ? ` ${time}` : "") : placeholder;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-card px-3 text-left text-sm shadow-sm hover:bg-muted/40"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", !d && "text-muted-foreground")}>{summary}</span>
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-[300px] rounded-md border border-border bg-card p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setView(addMonths(view, -1))}
              className="rounded p-1 hover:bg-muted"
              aria-label="เดือนก่อนหน้า"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-medium">
              {format(view, "MMMM yyyy", { locale: th })}
            </div>
            <button
              type="button"
              onClick={() => setView(addMonths(view, 1))}
              className="rounded p-1 hover:bg-muted"
              aria-label="เดือนถัดไป"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
            {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((day) => (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => clickDay(day)}
                className={cn(
                  "h-8 rounded text-sm transition-colors",
                  !isSameMonth(day, view) && "text-muted-foreground/40",
                  d && isSameDay(day, d)
                    ? "bg-primary font-medium text-white"
                    : "hover:bg-muted"
                )}
              >
                {day.getDate()}
              </button>
            ))}
          </div>

          {withTime ? (
            <div className="mt-3">
              <label className="mb-1 block text-xs text-muted-foreground">เวลา</label>
              <input
                type="time"
                lang="en-GB"
                value={time}
                disabled={!d}
                onChange={(ev) => {
                  if (!d) return;
                  const [h, m] = ev.target.value.split(":").map(Number);
                  const nd = new Date(d);
                  nd.setHours(h || 0, m || 0, 0, 0);
                  onChange(toStr(nd));
                }}
                className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm disabled:opacity-50"
              />
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              ล้าง
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded bg-primary px-3 py-1 text-xs font-medium text-white"
            >
              เสร็จ
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
