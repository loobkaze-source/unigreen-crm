"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { USER_ROLES } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * Compact multi-select for a member's roles. A member can hold several at once
 * (Technician + Safety, Sales + Manager, …), so a plain <select> no longer
 * fits. Shows the picked roles inline and opens a checkbox panel.
 *
 * The panel is portalled to <body> with fixed positioning: the users table
 * sits in an overflow container, which would otherwise clip it.
 */
export function RoleMultiSelect({
  value,
  onChange,
  disabled = false,
  className,
  placeholder = "— ยังไม่กำหนด —",
}: {
  value: string[];
  onChange: (roles: string[]) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(
    null
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function openPanel() {
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    // Flip above the button when there isn't room for the panel below it.
    const PANEL_HEIGHT = 380;
    const below = window.innerHeight - r.bottom;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 224 - 8));
    setPos(
      below < PANEL_HEIGHT && r.top > below
        ? { left, bottom: window.innerHeight - r.top + 4 }
        : { left, top: r.bottom + 4 }
    );
    setOpen(true);
  }

  // A fixed panel would drift away from its button on scroll/resize — close it.
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      // Scrolling the panel's own list is fine.
      if (e.type === "scroll" && panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function toggle(role: string) {
    const next = value.includes(role)
      ? value.filter((r) => r !== role)
      : [...value, role];
    // Keep a stable order so the primary role (and the label) don't jump around.
    onChange(USER_ROLES.filter((r) => next.includes(r)));
  }

  return (
    <div className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md border border-input bg-card px-2.5 py-2 text-left text-sm",
          "disabled:cursor-not-allowed disabled:opacity-50",
          !disabled && "hover:bg-muted"
        )}
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
          {value.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            value.map((r) => (
              <span
                key={r}
                className="rounded bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground"
              >
                {r}
              </span>
            ))
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && !disabled && pos
        ? createPortal(
            <>
              {/* Click-away catcher */}
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div
                ref={panelRef}
                className="fixed z-50 max-h-[80vh] w-56 overflow-y-auto rounded-md border border-border bg-card p-1 shadow-lg"
                style={pos}
              >
                {USER_ROLES.map((r) => {
                  const on = value.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => toggle(r)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          on ? "border-primary bg-primary text-white" : "border-input"
                        )}
                      >
                        {on ? <Check className="h-3 w-3" /> : null}
                      </span>
                      {r}
                    </button>
                  );
                })}
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  เลือกได้หลายบทบาท · admin ได้สิทธิ์ทุกอย่าง
                </p>
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  );
}
