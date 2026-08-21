"use client";

import { useEffect } from "react";

/**
 * Pinch to look closer; let go and the page springs back to size.
 *
 * A phone left zoomed in is a phone with half the card off the side of the
 * screen, and on site nobody notices they are zoomed — they notice the button
 * has gone missing. So the zoom is kept for as long as the fingers are down
 * and taken away the moment they lift.
 *
 * There is no API for "set the zoom back to 1". Clamping the viewport with
 * `maximum-scale=1` is the one thing every mobile browser answers by pulling
 * the page back to fit; the clamp is then lifted a frame later, because a page
 * that can only be pinched once is worse than one that cannot be pinched.
 *
 * Touch events only, so a desktop browser's ctrl+wheel zoom is left alone.
 */

/** Exactly what `viewport` in the root layout renders — they must not drift. */
const RELAXED = "width=device-width, initial-scale=1";
const CLAMPED = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";

export function PinchZoomSnapBack() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!viewport || !meta) return;

    let frame = 0;
    function snapBack() {
      // A tap that ended nothing is most touches on this app; scale is exactly
      // 1 then, and the meta tag is left alone.
      if (!viewport || !meta || viewport.scale <= 1.01) return;
      // A page that is a document rather than a screen — the A4 service report
      // — says so, and keeps its zoom: it is wider than any phone and reading
      // it is the whole point.
      if (document.querySelector("[data-allow-zoom]")) return;
      meta.setAttribute("content", CLAMPED);
      cancelAnimationFrame(frame);
      // Two frames: one for the browser to apply the clamp and pull the page
      // back, one before handing the pinch gesture back.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => meta?.setAttribute("content", RELAXED));
      });
    }

    // Fewer than two fingers left means the pinch is over — including the
    // double-tap zoom, which ends with none.
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) snapBack();
    };
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      meta.setAttribute("content", RELAXED);
    };
  }, []);

  return null;
}
