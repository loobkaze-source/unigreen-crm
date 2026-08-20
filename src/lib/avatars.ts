/**
 * The avatar faces a member can pick from, cut out of the sheet in avatar/ by
 * scripts/crop-avatars.mjs. Change the sheet, re-run the script, and set the
 * count here to whatever it reports.
 */
const COUNT = 60;

export const AVATARS = Array.from(
  { length: COUNT },
  (_, i) => `/avatars/av-${String(i + 1).padStart(2, "0")}.webp`
);

/** True for a value this app produced, so a stale or hand-edited one is ignored. */
export const isKnownAvatar = (url: string | null | undefined) =>
  !!url && AVATARS.includes(url);
