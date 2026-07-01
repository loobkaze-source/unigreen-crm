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
  startOfDay,
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
const timeStr = (d: Date | null, fallback: string) =>
  d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : fallback;
const dmy = (d: Date) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
/** Combine a day's date part with an "HH:mm" time. */
function combine(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(day);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

/**
 * Range picker for a scheduled start → end, styled like booking a round-trip:
 * pick the start day then the end day on one calendar, plus a time for each.
 * `start`/`end` are datetime-local strings; onChange emits the same.
 */
export function DateRangePicker({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}) {
  const s = parse(start);
  const e = parse(end);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(s ?? new Date());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (s) setView(startOfMonth(s));
    function onDoc(ev: MouseEvent) {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const startTime = timeStr(s, "09:00");
  const endTime = timeStr(e, "17:00");

  function clickDay(day: Date) {
    if (!s || (s && e)) {
      onChange(toStr(combine(day, startTime)), ""); // start a fresh range
    } else if (startOfDay(day) < startOfDay(s)) {
      onChange(toStr(combine(day, startTime)), ""); // move start earlier
    } else {
      onChange(start, toStr(combine(day, endTime))); // set end
    }
  }

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(view), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(view), { weekStartsOn: 0 }),
  });

  const summary = s
    ? `ไป ${dmy(s)} ${startTime}` +
      (e ? `  →  กลับ ${dmy(e)} ${endTime}` : "  →  เลือกวันสิ้นสุด")
    : "เลือกช่วงวันนัดหมาย (ไป–กลับ)";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-card px-3 text-left text-sm shadow-sm hover:bg-muted/40"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", !s && "text-muted-foreground")}>{summary}</span>
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
            {days.map((d) => {
              const isStart = s && isSameDay(d, s);
              const isEnd = e && isSameDay(d, e);
              const within = s && e && d > startOfDay(s) && d < startOfDay(e);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => clickDay(d)}
                  className={cn(
                    "h-8 rounded text-sm transition-colors",
                    !isSameMonth(d, view) && "text-muted-foreground/40",
                    isStart || isEnd
                      ? "bg-primary font-medium text-white"
                      : within
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted"
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">เวลาไป</label>
              <input
                type="time"
                value={startTime}
                disabled={!s}
                onChange={(ev) => {
                  if (!s) return;
                  const ns = combine(s, ev.target.value);
                  // Don't let the start pass the end — push the end along.
                  const ne = e && ns > e ? ns : e;
                  onChange(toStr(ns), ne ? toStr(ne) : "");
                }}
                className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm disabled:opacity-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">เวลากลับ</label>
              <input
                type="time"
                value={endTime}
                disabled={!e}
                onChange={(ev) => {
                  if (!e) return;
                  const nEnd = combine(e, ev.target.value);
                  // The end can't be earlier than the start — clamp to start.
                  const ce = s && nEnd < s ? s : nEnd;
                  onChange(start, toStr(ce));
                }}
                className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm disabled:opacity-50"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onChange("", "")}
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
