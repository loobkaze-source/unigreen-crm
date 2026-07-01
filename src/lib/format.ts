/** Shared date formatting — display dates as DD-MM-YYYY (Gregorian year). */

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** DD-MM-YYYY (empty string if invalid/missing). */
export function fmtDate(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}` : "";
}

/** DD-MM-YYYY HH:mm. */
export function fmtDateTime(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
}
