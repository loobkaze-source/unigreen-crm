/**
 * Centralised Supabase environment access.
 *
 * The app is designed to boot even before the Supabase keys are filled in
 * (so the dev server never crashes). Pages call `isSupabaseConfigured()` and
 * render a friendly setup notice when the keys are still placeholders.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const PLACEHOLDER = /your-project|placeholder|changeme|^$/i;

export function isSupabaseConfigured(): boolean {
  return (
    SUPABASE_URL.startsWith("http") &&
    !PLACEHOLDER.test(SUPABASE_URL) &&
    SUPABASE_ANON_KEY.length > 20 &&
    !PLACEHOLDER.test(SUPABASE_ANON_KEY)
  );
}
