const INT4_MAX = 2_147_483_647;

/**
 * The digits in a search box as a record number, or null when they can't be
 * one.
 *
 * `number` columns are int4. Searching a full report number such as
 * "MRD-0826-00001-01", a phone number or a tax ID yields more digits than an
 * int4 holds, and `number.eq.8260000101` makes Postgres raise "value out of
 * range for type integer" — which took the whole list page down to the error
 * screen, with the search still in the URL so retrying failed the same way.
 */
export function searchedRecordNumber(search: string): number | null {
  const digits = search.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits || digits.length > 10) return null;
  const n = Number(digits);
  return n <= INT4_MAX ? n : null;
}
