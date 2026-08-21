import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  // w-full min-w-0: a <select>'s automatic minimum size is its widest option,
  // so one holding an asset name is a row that cannot shrink — and the phone
  // scrolls sideways for the length of a serial number.
  <div className="relative w-full min-w-0">
    <select
      ref={ref}
      className={cn(
        "flex h-9 w-full min-w-0 appearance-none truncate rounded-md border border-input bg-card pl-3 pr-9 text-sm shadow-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
  </div>
));
Select.displayName = "Select";
