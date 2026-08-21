"use client";

import { Loader2 } from "lucide-react";
import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

/**
 * Swaps an icon for a spinner while the <Link> around it is still loading.
 *
 * Out on site a prefetch has often not finished when the thumb lands, and a
 * control that answers a tap with nothing gets tapped again. The spinner fades
 * in after 120ms (`.tap-wait` in globals.css) so a route that was already
 * prefetched never flickers one on its way out.
 *
 * The fade and the spin sit on separate elements on purpose: `animation` is a
 * shorthand that replaces rather than merges, so one rule would eat the other.
 *
 * Must be rendered inside the <Link> — that is where useLinkStatus reads from.
 */
export function LinkPending({
  children,
  className,
}: {
  /** What to show when nothing is loading — usually the resting icon. */
  children: React.ReactNode;
  /** Sizing for the spinner, matching the icon it stands in for. */
  className?: string;
}) {
  const { pending } = useLinkStatus();
  if (!pending) return children;
  return (
    <span className="tap-wait inline-flex shrink-0">
      <Loader2 className={cn("h-4 w-4 animate-spin", className)} />
    </span>
  );
}
