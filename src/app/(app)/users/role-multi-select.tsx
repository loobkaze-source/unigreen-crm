"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { USER_ROLES } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * Compact multi-select for a member's roles. A member can hold several at once
 * (Technician + Safety, Sales + Manager, …), so a plain <select> no longer
 * fits. Shows the picked roles inline and opens a checkbox panel.
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
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
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

      {open && !disabled ? (
        <>
          {/* Click-away catcher */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-56 rounded-md border border-border bg-card p-1 shadow-lg">
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
        </>
      ) : null}
    </div>
  );
}
