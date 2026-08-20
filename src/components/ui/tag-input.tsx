"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Several short values in one field, entered by typing and separated by commas.
 *
 * For the places a job carries a list of codes — the faults it answered, the
 * fixes applied — where one visit regularly has two or three and the vocabulary
 * is the team's own. Typing offers what has been used before, so the second
 * person to meet a fault writes it the way the first person did rather than
 * inventing a spelling; anything not on the list is still accepted, because the
 * list only exists because somebody typed something new once.
 */
export function TagInput({
  id,
  value,
  onChange,
  suggestions = [],
  placeholder,
  className,
}: {
  id?: string;
  value: string[];
  onChange: (next: string[]) => void;
  /** Values already in use elsewhere, offered while typing. */
  suggestions?: string[];
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);

  const add = React.useCallback(
    (raw: string) => {
      // A pasted "F01, F04" is two tags, not one with a comma in it.
      const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
      if (!parts.length) return;
      const next = [...value];
      for (const p of parts) {
        if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
      }
      onChange(next);
      setDraft("");
      setOpen(false);
    },
    [value, onChange]
  );

  const typed = draft.trim().toLowerCase();
  const matches = suggestions
    .filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()))
    .filter((s) => (typed ? s.toLowerCase().includes(typed) : true))
    .slice(0, 8);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(open && matches[active] && !draft.includes(",") ? matches[active] : draft);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && draft === "" && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className={cn("relative", className)}>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1.5 shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v !== tag))}
              aria-label={`เอา ${tag} ออก`}
              className="rounded-full p-0.5 hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          // Typing something and clicking away should keep it, not lose it.
          onBlur={() => {
            add(draft);
            setOpen(false);
          }}
          placeholder={value.length ? "" : placeholder}
          className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {open && matches.length ? (
        <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg">
          {matches.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                // Down rather than click: blur fires first and would take the
                // list away before the click landed on it.
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "w-full px-3 py-1.5 text-left text-sm",
                  i === active && "bg-muted"
                )}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
