/** Standard return shape for Server Actions invoked from Client Components. */
export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

export function ok(id?: string): ActionResult {
  return { ok: true, id };
}

export function fail(error: string): ActionResult {
  return { ok: false, error };
}
