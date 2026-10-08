/** Unique system Asset code: AS-0001. (Serial numbers aren't globally unique.) */
export const assetCode = (n: number | null | undefined) =>
  n == null ? "AS-—" : `AS-${String(n).padStart(4, "0")}`;

/** The columns assetLabel reads. */
export const ASSET_LABEL_COLUMNS = "code, name, asset_type, brand, serial_number, project_number";

/** How an asset reads in the work-order picker and on the job page:
 *  "AS-0012 · Inverter · SN123 (Huawei)". */
export function assetLabel(a: {
  code: number | null;
  name: string;
  asset_type: string | null;
  brand: string | null;
  serial_number: string | null;
  project_number: string | null;
}): string {
  const ident = a.asset_type === "project" ? a.project_number : a.serial_number;
  const brand = a.asset_type === "object" && a.brand ? ` (${a.brand})` : "";
  return `${assetCode(a.code)} · ${a.name}${ident ? ` · ${ident}` : ""}${brand}`;
}
