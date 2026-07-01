import { cn } from "@/lib/utils";

/** Small filled cloud glyph (uses currentColor). */
function CloudGlyph({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      <circle cx="8" cy="13.5" r="4" />
      <circle cx="16" cy="13.5" r="5" />
      <circle cx="12" cy="9.5" r="5" />
      <rect x="8" y="11" width="8" height="6.5" rx="2" />
    </svg>
  );
}

/**
 * Unicloud loading indicator — a spinning ring around a cloud mark,
 * echoing the Unicloud logo.
 */
export function CloudSpinner({
  size = 48,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label="กำลังโหลด"
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {/* Spinning ring */}
      <span
        className="absolute inset-0 animate-spin rounded-full border-primary/20 border-t-primary"
        style={{ borderWidth: Math.max(2, Math.round(size * 0.07)), animationDuration: "0.9s" }}
      />
      {/* Cloud mark */}
      <span className="text-primary">
        <CloudGlyph size={size * 0.5} />
      </span>
    </span>
  );
}

/** Backwards-compatible alias. */
export const TurbineSpinner = CloudSpinner;

/** Centred loading screen with the cloud spinner and a label. */
export function LoadingScreen({
  label = "กำลังโหลด…",
  fullScreen = false,
}: {
  label?: string;
  fullScreen?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4",
        fullScreen ? "min-h-screen" : "min-h-[60vh]"
      )}
    >
      <CloudSpinner size={64} />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
