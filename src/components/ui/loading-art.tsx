"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Cloud, Fuel, Sun, Zap } from "lucide-react";

/**
 * The loading mark: a sweeping ring with one of the company's four faces at
 * its centre — the Unicloud cloud, a pump, the sun, a bolt.
 *
 * The ring is what says "working": one continuous, unambiguous motion that
 * reads at any size. The glyph inside is what says whose app this is, and
 * changes each time so the wait has something to look at. They are drawn as
 * one system — same weight, same brand blue, same centre — rather than as four
 * unrelated pictures, which is what the four hand-drawn ones were.
 */

/** Circumference of the r=40 ring, so the dash lengths can be read as angles. */
const R = 40;
const C = 2 * Math.PI * R;

const FACES = [
  { Icon: Cloud, label: "Unicloud" },
  { Icon: Fuel, label: "fuel" },
  { Icon: Sun, label: "solar" },
  { Icon: Zap, label: "electrical" },
];

function LoadingMark({ face }: { face: number }) {
  // Unique per instance: two of these on one page must not share a gradient.
  const sweep = useId().replace(/:/g, "");
  const { Icon } = FACES[face];

  return (
    <span className="relative inline-flex h-24 w-24 items-center justify-center">
      {/* text-primary lives on the <svg>, not on the swept circle: the
          gradient stops resolve currentColor against their own inherited
          colour, so a class on the element that merely *references* the
          gradient leaves the sweep the page's foreground — near black. */}
      <svg viewBox="0 0 96 96" className="h-24 w-24 text-primary" aria-hidden>
        <defs>
          <linearGradient id={sweep} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
            <stop offset="55%" stopColor="currentColor" stopOpacity="0.7" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* The track the sweep runs on — faint, so the ring reads as a path
            rather than as a border that happens to be moving. */}
        <circle
          cx="48"
          cy="48"
          r={R}
          fill="none"
          strokeWidth="4"
          className="stroke-primary/10"
        />
        {/* A third of the ring, going round. Round caps so the head of the
            sweep is a nib rather than a cut edge. */}
        <circle
          cx="48"
          cy="48"
          r={R}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          stroke={`url(#${sweep})`}
          strokeDasharray={`${C * 0.34} ${C * 0.66}`}
          style={{ animation: "uc-rotor 1.15s linear infinite", transformOrigin: "48px 48px" }}
        />
      </svg>

      {/* The glyph sits above the ring rather than inside the same <svg> so it
          can breathe on its own clock — the ring's speed says "working", the
          glyph's slow pulse says "and it is alive". */}
      <Icon
        className="absolute h-10 w-10 text-primary"
        strokeWidth={1.75}
        style={{ animation: "uc-breathe 2.6s ease-in-out infinite" }}
        aria-hidden
      />
    </span>
  );
}

/**
 * A per-mount external store whose value is picked at random when the client
 * first subscribes. SSR (server snapshot) stays null so hydration always
 * matches the placeholder; the pick happens outside render, keeping render
 * pure — no effect, no ref-during-render.
 */
function createVariantStore() {
  let variant: number | null = null;
  return {
    subscribe(onChange: () => void) {
      if (variant === null) {
        variant = Math.floor(Math.random() * FACES.length);
        queueMicrotask(onChange);
      }
      return () => {};
    },
    getSnapshot: () => variant,
    getServerSnapshot: () => null,
  };
}

export function RandomLoadingArt() {
  const [store] = useState(createVariantStore);
  const variant = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot
  );

  if (variant === null) {
    return <span aria-hidden className="block h-24 w-24" />;
  }
  return (
    <span role="status" aria-label="กำลังโหลด">
      <LoadingMark face={variant} />
    </span>
  );
}
