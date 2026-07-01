/**
 * Username-based login. Supabase Auth keys on an email, so a bare username is
 * stored as an internal email `username@unicloud.local`. Users can log in with
 * just the username; accounts that have a real email keep using it.
 */
export const USERNAME_DOMAIN = "unicloud.local";

export const looksLikeEmail = (s: string) => s.includes("@");

/** Login identifier (username OR email) -> the email Supabase Auth expects. */
export function toAuthEmail(identifier: string): string {
  const id = identifier.trim().toLowerCase();
  if (!id) return id;
  return looksLikeEmail(id) ? id : `${id}@${USERNAME_DOMAIN}`;
}

/** Display form: hide the internal domain for username-only accounts. */
export function displayUsername(email: string | null | undefined): string {
  if (!email) return "";
  const e = email.trim();
  const suffix = `@${USERNAME_DOMAIN}`;
  return e.toLowerCase().endsWith(suffix) ? e.slice(0, e.length - suffix.length) : e;
}

/** Validate what an admin typed when creating a user (username or email). */
export function isValidLoginId(s: string): boolean {
  const id = s.trim();
  if (looksLikeEmail(id)) {
    // very light email check: x@y.z
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id);
  }
  // username: start & end alphanumeric, allow . _ - between, no consecutive
  // dots (an internal email local-part must be RFC-valid or GoTrue rejects it).
  return /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/i.test(id) && !/\.\./.test(id);
}
