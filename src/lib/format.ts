/**
 * Shared date formatting — DD-MM-YYYY, Gregorian year, Bangkok time.
 *
 * Bangkok wherever the code runs. The server is in UTC and the browser is
 * wherever the reader is, and a component rendered on one next to a component
 * rendered on the other showed the same moment seven hours apart — 15:00 in
 * one card, 22:00 in the next. The business keeps one clock, so this does.
 */
const TZ = "Asia/Bangkok";

const pad = (n: number | string) => String(n).padStart(2, "0");

/** A day with no time on it is a day; it does not move with the zone. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function bangkok(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}

/** DD-MM-YYYY (empty string if invalid/missing). */
export function fmtDate(v: string | Date | null | undefined): string {
  if (typeof v === "string") {
    const m = DATE_ONLY.exec(v);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  const d = toDate(v);
  if (!d) return "";
  const b = bangkok(d);
  return `${b.d}-${b.m}-${b.y}`;
}

/** DD-MM-YYYY HH:mm, Bangkok. */
export function fmtDateTime(v: string | Date | null | undefined): string {
  if (typeof v === "string" && DATE_ONLY.test(v)) return `${fmtDate(v)} 00:00`;
  const d = toDate(v);
  if (!d) return "";
  const b = bangkok(d);
  return `${b.d}-${b.m}-${b.y} ${pad(b.h)}:${pad(b.min)}`;
}
