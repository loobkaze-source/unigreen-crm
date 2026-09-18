"use client";

import { useEffect } from "react";

/**
 * A record opens in a new tab; the app itself does not.
 *
 * Working a list means opening a site, reading it, and coming back to the
 * list — and every time the list was gone, scrolled back to the top with its
 * filters reset. So a click on anything that leads *into* a record opens it
 * beside the list rather than instead of it. The sidebar, the tab bar, the
 * back links and the filters all still move this tab, because they are the
 * app, not something in it.
 *
 * "Into a record" is read off the URL: a resource followed by an id —
 * /sites/<uuid>, /work-orders/<uuid>/report — which is what every detail page
 * looks like and what no list, filter or back link ever does. Only for links
 * inside <main>; the shell around it is left alone.
 *
 * Desktop only. On a phone a new tab is a thing to hunt for afterwards, and
 * the back button already does what the list wanted.
 *
 * Only preventDefault(), never stopPropagation(): next/link checks
 * defaultPrevented before it navigates, so this is enough to stop the in-tab
 * navigation, and the click still reaches whatever onClick the link had — a
 * menu that closes itself, say.
 */
const RECORD = /^\/[a-z-]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/|\?|$)/i;

export function OpenRecordsInTabs() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // A modified click already means "new tab" to the browser; let it.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target || a.hasAttribute("download")) return;
      if (!a.closest("main")) return;
      const href = a.getAttribute("href") ?? "";
      if (!RECORD.test(href)) return;
      if (!window.matchMedia("(pointer: fine)").matches) return;

      e.preventDefault();
      window.open(href, "_blank", "noopener");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
