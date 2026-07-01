import * as React from "react";
import { cn } from "@/lib/utils";

/** Native date/time pickers render in the element's locale — force a day-first,
 *  24-hour format (DD/MM/YYYY) instead of the browser default (US MM/DD, AM/PM). */
const DATE_TYPES = ["date", "datetime-local", "time", "month", "week"];

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", lang, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    lang={lang ?? (DATE_TYPES.includes(type) ? "en-GB" : undefined)}
    className={cn(
      "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors",
      "placeholder:text-muted-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";
