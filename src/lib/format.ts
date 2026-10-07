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

/** HH:mm, Bangkok. */
export function fmtTime(v: string | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "";
  const b = bangkok(d);
  return `${pad(b.h)}:${pad(b.min)}`;
}

/** The Bangkok calendar day ("YYYY-MM-DD") a timestamp falls on — not the
 *  UTC day that slicing the ISO string gives, which is a day early before 07:00. */
export function bangkokDay(v: string | Date | null | undefined): string {
  if (typeof v === "string" && DATE_ONLY.test(v)) return v;
  const d = toDate(v);
  if (!d) return "";
  const b = bangkok(d);
  return `${b.y}-${b.m}-${b.d}`;
}

// ---- Date pickers ↔ stored timestamps --------------------------------------
// The pickers deal in zoneless wall-clock strings ("YYYY-MM-DDTHH:mm"). Those
// are Bangkok times, so they are pinned to +07:00 here rather than left to
// whatever zone parses them: on the UTC server `new Date("…T09:00")` is 09:00
// UTC (16:00 in Bangkok), and every save of an edit form pushed the time
// another seven hours on. Thailand has no daylight saving, so the offset is
// constant.

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/** A picker value (Bangkok wall clock) → UTC ISO for the DB; null when empty
 *  or invalid. A value that already carries a zone ("Z", "+07:00") is kept. */
export function bangkokInputToIso(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const withZone = LOCAL_DATETIME.test(s)
    ? `${s}+07:00`
    : DATE_ONLY.test(s)
      ? `${s}T00:00+07:00`
      : s;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A stored timestamp → the Bangkok wall-clock "YYYY-MM-DDTHH:mm" a picker
 *  shows. The same on the server and in any browser, so it hydrates cleanly. */
export function isoToBangkokInput(v: string | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "";
  const b = bangkok(d);
  return `${b.y}-${b.m}-${b.d}T${pad(b.h)}:${pad(b.min)}`;
}
