"use client";

import { useEffect } from "react";

/**
 * Pinch to look closer; let go and the page springs back to size.
 *
 * A phone left zoomed in is a phone with half the card off the side of the
 * screen, and on site nobody notices they are zoomed — they notice the button
 * has gone missing.
 *
 * Three things this has to get right, each of which stopped it working:
 *
 *  - The end of the gesture is read from the viewport, not from touch events.
 *    Chrome hands a recognised pinch to the compositor and the page gets a
 *    `touchcancel` at the *start* of it — the release never arrives. So the
 *    signal is the scale going quiet: 250ms without a further change.
 *
 *  - The meta tag is looked up each time. It belongs to the root layout, and a
 *    client navigation can hand back a different element than the one that was
 *    there at mount; writing to the old one writes to nothing.
 *
 *  - The clamp is held long enough to be applied. There is no API for "set the
 *    zoom back to 1"; `maximum-scale=1` is the one thing every mobile browser
 *    answers by pulling the page back to fit, and it has to still be in force
 *    when the browser gets round to reading it. Two animation frames was not.
 *    It is lifted afterwards, because a page that can be pinched once is worse
 *    than one that cannot be pinched at all.
 */

/** Exactly what `viewport` in the root layout renders — they must not drift. */
const RELAXED = "width=device-width, initial-scale=1";
const CLAMPED = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";

/** How long the scale must sit still before the pinch counts as over. */
const SETTLED_MS = 250;
/** How long the clamp is held before the pinch is handed back. */
const CLAMP_MS = 350;

export function PinchZoomSnapBack() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let settle: number | undefined;
    let release: number | undefined;

    function snapBack() {
      if (!viewport || viewport.scale <= 1.01) return;
      // A page that is a document rather than a screen — the A4 service report
      // — says so, and keeps its zoom: it is wider than any phone and reading
      // it is the whole point.
      if (document.querySelector("[data-allow-zoom]")) return;
      const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
      if (!meta) return;

      meta.setAttribute("content", CLAMPED);
      window.clearTimeout(release);
      release = window.setTimeout(() => {
        document
          .querySelector<HTMLMetaElement>('meta[name="viewport"]')
          ?.setAttribute("content", RELAXED);
      }, CLAMP_MS);
    }

    function scaleChanged() {
      window.clearTimeout(settle);
      settle = window.setTimeout(snapBack, SETTLED_MS);
    }

    viewport.addEventListener("resize", scaleChanged);
    viewport.addEventListener("scroll", scaleChanged);
    // Where the release does reach the page it is the earlier and truer
    // signal, so it is taken as well — and costs nothing where it never comes.
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        window.clearTimeout(settle);
        snapBack();
      }
    };
    window.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      window.clearTimeout(settle);
      window.clearTimeout(release);
      viewport.removeEventListener("resize", scaleChanged);
      viewport.removeEventListener("scroll", scaleChanged);
      window.removeEventListener("touchend", onTouchEnd);
      document
        .querySelector<HTMLMetaElement>('meta[name="viewport"]')
        ?.setAttribute("content", RELAXED);
    };
  }, []);

  return null;
}
