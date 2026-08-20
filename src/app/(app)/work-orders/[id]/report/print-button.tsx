"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

/** The only two controls on the page, and neither of them prints. */
export function PrintBar({ backHref }: { backHref: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> กลับไปที่ใบงาน
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white active:opacity-90"
      >
        <Printer className="h-4 w-4" /> พิมพ์ / บันทึก PDF
      </button>
    </div>
  );
}
