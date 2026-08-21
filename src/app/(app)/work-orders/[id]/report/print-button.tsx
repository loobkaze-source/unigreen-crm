"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { LinkPending } from "@/components/ui/link-pending";

/** The only two controls on the page, and neither of them prints. */
export function PrintBar({ backHref }: { backHref: string }) {
  const [preparing, setPreparing] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const autoPrint = useSearchParams().get("print") === "1";
  const fired = useRef(false);

  /**
   * Arriving with ?print=1 means the tap that got here was "save the PDF", so
   * the save sheet opens by itself and the trip is one tap instead of three.
   *
   * It waits for the fonts and every photograph first: print() snapshots the
   * page as it stands, and a second page of empty frames is worse than a
   * second tap. The query is then dropped from the URL so a back-navigation
   * or a refresh does not open the sheet all over again.
   */
  useEffect(() => {
    if (!autoPrint || fired.current) return;
    fired.current = true;
    let live = true;
    (async () => {
      try {
        await document.fonts?.ready;
      } catch {
        // A browser without the font API just prints a beat earlier.
      }
      await Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map(
            (img) =>
              new Promise((done) => {
                img.addEventListener("load", () => done(null), { once: true });
                img.addEventListener("error", () => done(null), { once: true });
              })
          )
      );
      if (!live) return;
      router.replace(pathname);
      window.print();
    })();
    return () => {
      live = false;
    };
  }, [autoPrint, pathname, router]);

  /**
   * `window.print()` blocks the main thread until the dialog is up, and on a
   * phone building the PDF takes a second or two — during which a button that
   * has not repainted looks like a button that did nothing, and gets pressed
   * again. So the label is changed first and the print is left to two frames
   * later, once that change is actually on the glass.
   */
  function print() {
    if (preparing) return;
    setPreparing(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        try {
          window.print();
        } finally {
          setPreparing(false);
        }
      })
    );
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <LinkPending>
          <ArrowLeft className="h-4 w-4" />
        </LinkPending>
        กลับไปที่ใบงาน
      </Link>
      <button
        type="button"
        onClick={print}
        disabled={preparing}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white active:opacity-90 disabled:opacity-70"
      >
        {preparing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Printer className="h-4 w-4" />
        )}
        {preparing ? "กำลังเตรียม…" : "พิมพ์ / บันทึก PDF"}
      </button>
    </div>
  );
}
