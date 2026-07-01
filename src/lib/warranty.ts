/** Warranty expiry = start date + N months (null if either is missing). */
export function warrantyEnd(
  start: string | null | undefined,
  months: number | null | undefined
): Date | null {
  if (!start || !months) return null;
  const d = new Date(start + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Clamp end-of-month overflow (e.g. Jan 31 + 1mo -> Mar 3): setDate(0) walks
  // back to the last day of the intended month.
  if (d.getDate() !== day) d.setDate(0);
  return d;
}

export type WarrantyState = "active" | "expired" | "none";

export function warrantyState(end: Date | null): WarrantyState {
  if (!end) return "none";
  return end.getTime() >= Date.now() ? "active" : "expired";
}
