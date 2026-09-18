import { cn } from "@/lib/utils";

/** A pill that is either the chosen one or not. Filters, mostly. */
export function Chip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  /** Shown after the label, so a chip says how much it hides. */
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-white"
          : "border-border bg-card text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
      {count !== undefined ? (
        <span className={cn("rounded-full px-1.5 text-[11px]", active ? "bg-white/20" : "bg-muted")}>
          {count}
        </span>
      ) : null}
    </button>
  );
}
