"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: "md" | "lg";
}) {
  /**
   * Whether anything has been typed or picked since this opened. A click that
   * lands on the backdrop is as often a miss as an intention, and a long form
   * lost to one is what this guards against — a dialog nobody has touched
   * still closes on the first click, because there is nothing to lose.
   */
  const [touched, setTouched] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Opening or closing starts the question over; the dialog outlives its own
  // open state, so a form filled in once would otherwise stay "touched".
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    setTouched(false);
    setConfirming(false);
  }

  function requestClose() {
    if (touched) setConfirming(true);
    else onClose();
  }

  // An effect event reads the latest touched/confirming without putting them
  // in the deps — the keydown listener and the body overflow are set up once
  // per open, not torn down and rebuilt on every keystroke in the form.
  const onEscape = React.useEffectEvent(() => {
    // While the question is up, Escape answers it rather than closing behind it.
    if (confirming) setConfirming(false);
    else if (touched) setConfirming(true);
    else onClose();
  });

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    document.addEventListener("keydown", onKey);
    // Restore whatever was there before — another overlay may own it too.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  React.useEffect(() => {
    const el = panelRef.current;
    if (!open || !el) return;
    const touch = (e: Event) => {
      // Typing into a picker's search box is looking for a value, not entering one.
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-combobox-search]")) return;
      setTouched(true);
    };
    el.addEventListener("input", touch);
    el.addEventListener("change", touch);
    return () => {
      el.removeEventListener("input", touch);
      el.removeEventListener("change", touch);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={requestClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 mt-10 w-full rounded-xl border border-border bg-card shadow-xl",
          size === "lg" ? "max-w-2xl" : "max-w-lg"
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          <button
            onClick={requestClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>

      {confirming ? (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setConfirming(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-xl border border-border bg-card p-5 shadow-xl"
          >
            <h3 className="text-base font-semibold">ปิดหน้าต่างนี้?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              สิ่งที่กรอกไว้จะไม่ถูกบันทึก
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirming(false)} autoFocus>
                กรอกต่อ
              </Button>
              <Button variant="destructive" onClick={onClose}>
                ปิดโดยไม่บันทึก
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
