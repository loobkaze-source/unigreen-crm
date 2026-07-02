/**
 * Asset operating status. Set from the case form when a problem is reported
 * (Customer Service / Dispatcher), auto-restored to "operational" when a
 * repair work order covering the asset completes, and overridable from the
 * asset lifetime page. "retired" is admin-only.
 */
export type AssetStatus = "operational" | "degraded" | "down" | "retired";

type Tone = "success" | "warning" | "danger" | "muted";

export const ASSET_STATUSES: { value: AssetStatus; label: string; tone: Tone }[] = [
  { value: "operational", label: "ใช้งานได้", tone: "success" },
  { value: "degraded", label: "พอใช้งานได้", tone: "warning" },
  { value: "down", label: "ใช้งานไม่ได้", tone: "danger" },
  { value: "retired", label: "ปลดระวาง", tone: "muted" },
];

export const assetStatusMeta = (s: string | null | undefined) =>
  ASSET_STATUSES.find((x) => x.value === s) ?? ASSET_STATUSES[0];
