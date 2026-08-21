"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { LinkPending } from "@/components/ui/link-pending";

/** The only two controls on the page, and neither of them prints. */
export function PrintBar({ backHref }: { backHref: string }) {
  const [preparing, setPreparing] = useState(false);

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
