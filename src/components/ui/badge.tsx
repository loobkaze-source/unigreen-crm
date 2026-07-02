import * as React from "react";
import { cn } from "@/lib/utils";

type Tone =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "muted";

const tones: Record<Tone, string> = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-accent text-accent-foreground",
  success: "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
  danger: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400",
  info: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400",
  muted: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export function Badge({
  tone = "default",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
