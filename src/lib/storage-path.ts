/**
 * Every file the app uploads lives at `<org_id>/<record_id>/<file>` — the
 * storage policies (migration 0058) key off the first segment, and the delete
 * actions remove whatever path the DB row holds.
 *
 * So a path a client hands to a server action must sit directly in that
 * record's own folder. Otherwise a caller could register another record's file
 * (or another org's) under a row they control, and then delete it through that
 * row.
 */
export function isOwnStoragePath(path: string, orgId: string, recordId: string) {
  const prefix = `${orgId}/${recordId}/`;
  if (!path.startsWith(prefix)) return false;
  const file = path.slice(prefix.length);
  return file.length > 0 && !file.includes("/") && !file.includes("..");
}
