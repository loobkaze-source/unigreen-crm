/** Unique system Asset code: AS-0001. (Serial numbers aren't globally unique.) */
export const assetCode = (n: number | null | undefined) =>
  n == null ? "AS-—" : `AS-${String(n).padStart(4, "0")}`;
